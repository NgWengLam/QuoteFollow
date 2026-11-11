-- Nudge v0.1. Apply once in a fresh Supabase project (Singapore region).
create extension if not exists pgcrypto;
create table public.businesses (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null unique references auth.users(id) on delete cascade,
 name text not null check(length(name) between 1 and 120), contact_email text not null default '', phone text not null default '',
 send_start integer not null default 9 check(send_start between 8 and 17), send_end integer not null default 18 check(send_end between 9 and 20),
 weekdays_only boolean not null default true, automation_enabled boolean not null default false,
 created_at timestamptz not null default now(), check(send_end>send_start)
);
create table public.customers (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses on delete cascade,
 name text not null check(length(name) between 1 and 120), email text not null default '' check(length(email)<=254),
 phone text not null default '' check(length(phone)<=40), company text not null default '' check(length(company)<=120),
 consent boolean not null default false, unsubscribed boolean not null default false, created_at timestamptz not null default now(),unique(id,business_id)
);
create table public.quotations (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses on delete cascade, customer_id uuid not null,
 quote_number text not null check(length(quote_number) between 1 and 40), project text not null check(length(project) between 1 and 160),
 items jsonb not null, amount_cents bigint not null check(amount_cents between 0 and 1000000000), sent_date date not null,
 status text not null default 'pending' check(status in ('pending','accepted','rejected','no_reply')),
 followups_enabled boolean not null default false, replied_at timestamptz, notes text not null default '' check(length(notes)<=3000),
 reply_token uuid not null default gen_random_uuid(), created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(business_id,quote_number),unique(id,business_id),unique(reply_token),foreign key(customer_id,business_id) references public.customers(id,business_id)
);
create table public.follow_up_rules (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses on delete cascade,
 days_after integer not null check(days_after between 1 and 90),template text not null check(length(template) between 1 and 2000),unique(business_id,days_after)
);
create table public.reminders (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses on delete cascade,quotation_id uuid not null,
 days_after integer not null,template text not null,send_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','processing','sent','failed','cancelled','needs_review')),
 attempt_count integer not null default 0,first_attempt_at timestamptz,lease_until timestamptz,claim_token uuid,
 payload jsonb,provider_id text,sent_at timestamptz,last_error text,created_at timestamptz not null default now(),
 unique(quotation_id,days_after),foreign key(quotation_id,business_id) references public.quotations(id,business_id) on delete cascade
);
create index reminders_due on public.reminders(send_at) where status in ('pending','processing');
create table public.message_logs (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses on delete cascade,quotation_id uuid not null,
 reminder_id uuid unique references public.reminders(id),channel text not null default 'email',direction text not null default 'outbound',
 content text not null,subject text not null default '',provider_id text,event_id text unique,sent_at timestamptz not null default now(),
 foreign key(quotation_id,business_id) references public.quotations(id,business_id) on delete cascade
);
-- Every tenant table has RLS. Background-only tables are read-only for users.
alter table public.businesses enable row level security;
alter table public.customers enable row level security;
alter table public.quotations enable row level security;
alter table public.follow_up_rules enable row level security;
alter table public.reminders enable row level security;
alter table public.message_logs enable row level security;
create policy business_read on public.businesses for select to authenticated using(owner_id=(select auth.uid()));
create policy business_update on public.businesses for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy customer_access on public.customers for all to authenticated using(business_id in(select id from public.businesses where owner_id=(select auth.uid()))) with check(business_id in(select id from public.businesses where owner_id=(select auth.uid())));
create policy quote_read on public.quotations for select to authenticated using(business_id in(select id from public.businesses where owner_id=(select auth.uid())));
create policy rule_read on public.follow_up_rules for select to authenticated using(business_id in(select id from public.businesses where owner_id=(select auth.uid())));
create policy reminder_read on public.reminders for select to authenticated using(business_id in(select id from public.businesses where owner_id=(select auth.uid())));
create policy log_read on public.message_logs for select to authenticated using(business_id in(select id from public.businesses where owner_id=(select auth.uid())));
revoke all on public.businesses,public.customers,public.quotations,public.follow_up_rules,public.reminders,public.message_logs from anon,authenticated;
grant select on public.businesses,public.customers,public.quotations,public.follow_up_rules,public.reminders,public.message_logs to authenticated;
grant update(name,contact_email,phone,send_start,send_end,weekdays_only,automation_enabled) on public.businesses to authenticated;
grant insert(business_id,name,email,phone,company,consent),update(name,email,phone,company,consent) on public.customers to authenticated;
grant all on public.businesses,public.customers,public.quotations,public.follow_up_rules,public.reminders,public.message_logs to service_role;

create function public.onboard_business(business_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare bid uuid;
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 insert into public.businesses(owner_id,name) values(auth.uid(),trim(business_name)) on conflict(owner_id) do nothing;
 select id into bid from public.businesses where owner_id=auth.uid();
 return bid;
end;$$;

create function public.save_rules(rules jsonb) returns void language plpgsql security definer set search_path='' as $$
declare bid uuid;r jsonb;
begin
 select id into bid from public.businesses where owner_id=auth.uid() for update;
 if bid is null then raise exception 'Business not found';end if;
 if jsonb_typeof(rules)<>'array' or jsonb_array_length(rules)>5 then raise exception 'Use up to five rules';end if;
 delete from public.follow_up_rules where business_id=bid;
 for r in select * from jsonb_array_elements(rules) loop
  insert into public.follow_up_rules(business_id,days_after,template) values(bid,(r->>'days_after')::integer,r->>'template');
 end loop;
end;$$;

create function public.save_quote(data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare bid uuid;qid uuid;cid uuid;it jsonb;qty numeric;price bigint;total bigint:=0;d date;enabled boolean;
begin
 select id into bid from public.businesses where owner_id=auth.uid();if bid is null then raise exception 'Business not found';end if;
 cid:=(data->>'customer_id')::uuid;
 perform 1 from public.customers where id=cid and business_id=bid;if not found then raise exception 'Customer not found';end if;
 if jsonb_typeof(data->'items')<>'array' or jsonb_array_length(data->'items') not between 1 and 50 then raise exception 'Add 1–50 items';end if;
 for it in select * from jsonb_array_elements(data->'items') loop
  qty:=(it->>'quantity')::numeric;price:=(it->>'unit_price_cents')::bigint;
  if qty is null or price is null or qty<=0 or qty>100000 or qty<>round(qty,2) or price<0 or price>100000000 or coalesce(length(trim(it->>'description')),0) not between 1 and 300 then raise exception 'Invalid quotation item';end if;
  total:=total+round(qty*price);
 end loop;
 d:=(data->>'sent_date')::date;enabled:=coalesce((data->>'followups_enabled')::boolean,false);
 if d>(now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'Sent date cannot be in the future';end if;
 qid:=coalesce(nullif(data->>'id','')::uuid,gen_random_uuid());
 if data->>'id' is not null then
  perform 1 from public.quotations where id=qid and business_id=bid and status='pending' and replied_at is null for update;
  if not found then raise exception 'Only open, unreplied quotations can be edited';end if;
  if exists(select 1 from public.reminders where quotation_id=qid and first_attempt_at is not null) then raise exception 'Follow-ups already started. Close this quote and create a revision instead.';end if;
  update public.quotations set customer_id=cid,quote_number=trim(data->>'quote_number'),project=trim(data->>'project'),items=data->'items',amount_cents=total,sent_date=d,followups_enabled=enabled,notes=coalesce(data->>'notes',''),updated_at=now() where id=qid;
  delete from public.reminders where quotation_id=qid;
 else
  insert into public.quotations(id,business_id,customer_id,quote_number,project,items,amount_cents,sent_date,followups_enabled,notes) values(qid,bid,cid,trim(data->>'quote_number'),trim(data->>'project'),data->'items',total,d,enabled,coalesce(data->>'notes',''));
 end if;
 if enabled then
  insert into public.reminders(business_id,quotation_id,days_after,template,send_at)
  select bid,qid,days_after,template,((d+days_after)+time '09:00') at time zone 'Asia/Kuala_Lumpur' from public.follow_up_rules where business_id=bid;
 end if;
 return qid;
end;$$;

create function public.set_quote_status(quote_id uuid,new_status text,mark_replied boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
 if new_status not in('pending','accepted','rejected','no_reply') then raise exception 'Invalid status';end if;
 update public.quotations set status=new_status,replied_at=case when mark_replied then coalesce(replied_at,now()) else replied_at end,
 followups_enabled=case when mark_replied or new_status<>'pending' then false else followups_enabled end,updated_at=now()
 where id=quote_id and business_id in(select id from public.businesses where owner_id=auth.uid());
 if not found then raise exception 'Quotation not found';end if;
 if mark_replied or new_status<>'pending' then update public.reminders set status='cancelled',lease_until=null where quotation_id=quote_id and status in('pending','processing','needs_review','failed');end if;
end;$$;

-- Scheduler RPCs: service_role only. A claim lease, immutable payload and provider
-- idempotency protect retries. Unknown deliveries older than 23h require manual review.
create function public.claim_reminder() returns setof public.reminders language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 update public.reminders set status='needs_review',last_error='Delivery uncertain. Reconcile with provider before any manual resend.' where status in('pending','processing') and first_attempt_at<now()-interval '23 hours';
 select r.id into rid from public.reminders r join public.quotations q on q.id=r.quotation_id join public.businesses b on b.id=r.business_id join public.customers c on c.id=q.customer_id
 where r.send_at<=now() and (r.status='pending' or(r.status='processing' and r.lease_until<now()))
 and not exists(select 1 from public.reminders older where older.quotation_id=r.quotation_id and older.id<>r.id and older.status in('pending','processing','failed','needs_review') and older.days_after<r.days_after)
 and not exists(select 1 from public.reminders recent where recent.quotation_id=r.quotation_id and recent.sent_at>now()-interval '24 hours')
 and q.status='pending' and q.replied_at is null and q.followups_enabled and b.automation_enabled and c.consent and not c.unsubscribed and c.email<>''
 and extract(hour from now() at time zone 'Asia/Kuala_Lumpur')>=b.send_start and extract(hour from now() at time zone 'Asia/Kuala_Lumpur')<b.send_end
 and (not b.weekdays_only or extract(isodow from now() at time zone 'Asia/Kuala_Lumpur')<=5)
 order by r.send_at limit 1 for update of r skip locked;
 if rid is null then return;end if;
 return query update public.reminders set status='processing',lease_until=now()+interval '10 minutes',claim_token=gen_random_uuid() where id=rid returning *;
end;$$;
create function public.prepare_reminder(reminder_id uuid,token uuid,email_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.reminders;q public.quotations;b public.businesses;c public.customers;
begin
 select * into r from public.reminders where id=reminder_id and claim_token=token and status='processing' and lease_until>now() for update;
 if not found then return null;end if;
 select * into q from public.quotations where id=r.quotation_id;select * into b from public.businesses where id=r.business_id;select * into c from public.customers where id=q.customer_id;
 if q.status<>'pending' or q.replied_at is not null or not q.followups_enabled or not b.automation_enabled or not c.consent or c.unsubscribed then
 update public.reminders set status='cancelled' where id=r.id;return null;end if;
 if extract(hour from now() at time zone 'Asia/Kuala_Lumpur')<b.send_start or extract(hour from now() at time zone 'Asia/Kuala_Lumpur')>=b.send_end or(b.weekdays_only and extract(isodow from now() at time zone 'Asia/Kuala_Lumpur')>5) then
 update public.reminders set status='pending',lease_until=null where id=r.id;return null;end if;
 if r.first_attempt_at<now()-interval '23 hours' then update public.reminders set status='needs_review' where id=r.id;return null;end if;
 update public.reminders set payload=coalesce(payload,email_payload),first_attempt_at=coalesce(first_attempt_at,now()),attempt_count=attempt_count+1 where id=r.id returning payload into email_payload;
 return email_payload;
end;$$;
create function public.finish_reminder(reminder_id uuid,token uuid,outcome text,provider text default null) returns void language plpgsql security definer set search_path='' as $$
declare r public.reminders;
begin
 select * into r from public.reminders where id=reminder_id and claim_token=token for update;if not found then return;end if;
 if r.status='sent' then return;end if;
 if outcome='sent' then
  update public.reminders set status='sent',sent_at=now(),provider_id=provider,lease_until=null,last_error=null where id=r.id;
  insert into public.message_logs(business_id,quotation_id,reminder_id,content,subject,provider_id) values(r.business_id,r.quotation_id,r.id,r.payload->>'text',r.payload->>'subject',provider) on conflict on constraint message_logs_reminder_id_key do nothing;
 elsif r.status='processing' then
  update public.reminders set status=case when outcome='failed' then 'failed' when attempt_count>=5 then 'needs_review' else 'pending' end,send_at=now()+interval '1 hour',lease_until=null,last_error=case when outcome='failed' then 'Provider rejected this message. Check sender and recipient configuration.' else 'Delivery uncertain; retry uses the same idempotency key.' end where id=r.id;
 end if;
end;$$;
create function public.record_reply(reply_address_token uuid,sender_email text,webhook_event_id text) returns void language plpgsql security definer set search_path='' as $$
declare q public.quotations;
begin
 select qt.* into q from public.quotations qt join public.customers c on c.id=qt.customer_id where qt.reply_token=reply_address_token and lower(c.email)=lower(sender_email) for update of qt;
 if not found then return;end if;
 insert into public.message_logs(business_id,quotation_id,direction,content,event_id) values(q.business_id,q.id,'inbound','Customer replied by email. Follow-ups stopped. Check the inbound mailbox for the full reply.',webhook_event_id) on conflict(event_id) do nothing;
 update public.quotations set replied_at=coalesce(replied_at,now()),followups_enabled=false,updated_at=now() where id=q.id;
 update public.reminders set status='cancelled',lease_until=null where quotation_id=q.id and status in('pending','processing','failed','needs_review');
end;$$;
create function public.stop_bounced_contact(email_id text,webhook_event_id text) returns void language plpgsql security definer set search_path='' as $$
declare q public.quotations;
begin
 select qt.* into q from public.quotations qt join public.message_logs l on l.quotation_id=qt.id where l.provider_id=email_id limit 1;
 if not found then return;end if;
 update public.customers set unsubscribed=true where id=q.customer_id;
 update public.reminders set status='cancelled' where quotation_id in(select id from public.quotations where customer_id=q.customer_id) and status in('pending','processing');
 insert into public.message_logs(business_id,quotation_id,direction,content,event_id) values(q.business_id,q.id,'system','Email bounced or recipient complained. Further email follow-ups blocked.',webhook_event_id) on conflict(event_id) do nothing;
end;$$;
revoke all on function public.onboard_business(text),public.save_rules(jsonb),public.save_quote(jsonb),public.set_quote_status(uuid,text,boolean),public.claim_reminder(),public.prepare_reminder(uuid,uuid,jsonb),public.finish_reminder(uuid,uuid,text,text),public.record_reply(uuid,text,text),public.stop_bounced_contact(text,text) from public,anon,authenticated;
grant execute on function public.onboard_business(text),public.save_rules(jsonb),public.save_quote(jsonb),public.set_quote_status(uuid,text,boolean) to authenticated;
grant execute on function public.claim_reminder(),public.prepare_reminder(uuid,uuid,jsonb),public.finish_reminder(uuid,uuid,text,text),public.record_reply(uuid,text,text),public.stop_bounced_contact(text,text) to service_role;
