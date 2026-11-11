import { createClient } from "@supabase/supabase-js";
export const supabase =
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
    ? createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY,
      )
    : null;
export const unwrap = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};
export async function loadLive() {
  const business = unwrap(
    await supabase.from("businesses").select("*").maybeSingle(),
  );
  if (!business) return null;
  const tables = [
    "customers",
    "quotations",
    "follow_up_rules",
    "reminders",
    "message_logs",
  ];
  const data = await Promise.all(
    tables.map((t) =>
      supabase
        .from(t)
        .select("*")
        .eq("business_id", business.id)
        .order(
          t === "follow_up_rules"
            ? "days_after"
            : t === "message_logs"
              ? "sent_at"
              : "created_at",
          { ascending: t === "follow_up_rules" },
        ),
    ),
  );
  // Message log ordering differs from entity creation ordering.
  const result = { business };
  ["customers", "quotations", "rules", "reminders", "logs"].forEach((k, i) => {
    result[k] = unwrap(data[i]);
  });
  return result;
}
