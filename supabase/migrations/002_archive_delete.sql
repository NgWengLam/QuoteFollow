-- Archive (any quotation) and Delete (only quotations with no sent emails).
-- Apply once, after 001_initial.sql, in the Supabase SQL editor.
alter table public.quotations add column if not exists archived_at timestamptz;

-- Archiving stops all remaining follow-ups. Unarchiving does NOT restart them.
create or replace function public.archive_quote(quote_id uuid,archive boolean default true) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.quotations set archived_at=case when archive then coalesce(archived_at,now()) else null end,
 followups_enabled=case when archive then false else followups_enabled end,updated_at=now()
 where id=quote_id and business_id in(select id from public.businesses where owner_id=auth.uid());
 if not found then raise exception 'Quotation not found';end if;
 if archive then update public.reminders set status='cancelled',lease_until=null where quotation_id=quote_id and status in('pending','processing','needs_review','failed');end if;
end;$$;

-- Delete is allowed only when no follow-up email was ever attempted or sent.
create or replace function public.delete_quote(quote_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.quotations where id=quote_id and business_id in(select id from public.businesses where owner_id=auth.uid()) for update;
 if not found then raise exception 'Quotation not found';end if;
 if exists(select 1 from public.reminders where quotation_id=quote_id and (status='sent' or first_attempt_at is not null))
 or exists(select 1 from public.message_logs where quotation_id=quote_id) then
  raise exception 'This quotation has email history. Archive it instead.';
 end if;
 delete from public.quotations where id=quote_id;
end;$$;

-- Archived quotations cannot be edited (editing could re-enable follow-ups).
create or replace function public.block_archived_edit() returns trigger language plpgsql set search_path='' as $$
begin
 if old.archived_at is not null and new.archived_at is not null and new.followups_enabled and not old.followups_enabled then
  raise exception 'Unarchive this quotation before editing it.';
 end if;
 return new;
end;$$;
drop trigger if exists quotations_block_archived_edit on public.quotations;
create trigger quotations_block_archived_edit before update on public.quotations for each row execute function public.block_archived_edit();

revoke all on function public.archive_quote(uuid,boolean),public.delete_quote(uuid) from public,anon,authenticated;
grant execute on function public.archive_quote(uuid,boolean),public.delete_quote(uuid) to authenticated;
