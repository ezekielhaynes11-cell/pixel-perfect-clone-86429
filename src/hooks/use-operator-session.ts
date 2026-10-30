import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// A session enables operator controls; each protected server function still verifies its role.
export function useOperatorSession(): boolean {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setSignedIn(!!session);
    });
    void supabase.auth.getSession().then(
      ({ data, error }) => {
        if (active) setSignedIn(!error && !!data.session);
      },
      () => {
        if (active) setSignedIn(false);
      },
    );
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return signedIn;
}
