## Plan

1. Edit `supabase/functions/enrich-contact/index.ts`: replace the `DECISION_MAKER_TITLES` array contents with exactly these four strings:
   - `Director of Point of Care Ultrasound`
   - `Director of Clinical Ultrasound`
   - `Director of Imaging`
   - `Clinical Engineering Director`
2. Deploy the `enrich-contact` edge function via `supabase--deploy_edge_functions`.

No other files or logic change.