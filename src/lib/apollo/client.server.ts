// Thin wrapper around the Apollo.io REST API.
// Docs: https://docs.apollo.io/reference

const APOLLO_BASE = "https://api.apollo.io/api/v1";
const TIMEOUT_MS = 30_000;

function key(): string {
  const k = process.env.APOLLO_API_KEY;
  if (!k) throw new Error("APOLLO_API_KEY is not configured");
  return k;
}

async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${APOLLO_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        "x-api-key": key(),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("Apollo rate limit hit — try again in a minute.");
      if (res.status === 402) throw new Error("Apollo credits exhausted.");
      if (res.status === 401) throw new Error("Apollo API key rejected.");
      throw new Error(`Apollo ${path} ${res.status}: ${text.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export interface ApolloPerson {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  title?: string | null;
  linkedin_url?: string | null;
  email?: string | null;
  email_status?: string | null;
  phone_numbers?: Array<{ raw_number?: string | null; sanitized_number?: string | null }> | null;
  city?: string | null;
  state?: string | null;
  organization?: { id?: string; name?: string; website_url?: string } | null;
  headline?: string | null;
}

export interface ApolloOrg {
  id: string;
  name?: string;
  website_url?: string;
  primary_domain?: string;
  estimated_num_employees?: number;
  industry?: string;
  city?: string;
  state?: string;
  short_description?: string;
}

export async function apolloPeopleSearch(input: {
  person_titles?: string[];
  q_keywords?: string;
  person_locations?: string[];
  organization_locations?: string[];
  organization_name?: string;
  page?: number;
  per_page?: number;
}): Promise<{ people: ApolloPerson[]; pagination?: { total_entries?: number } }> {
  return call("/mixed_people/search", {
    page: input.page ?? 1,
    per_page: Math.min(input.per_page ?? 25, 100),
    person_titles: input.person_titles,
    q_keywords: input.q_keywords,
    person_locations: input.person_locations,
    organization_locations: input.organization_locations,
    organization_name: input.organization_name,
  });
}

export async function apolloPersonMatch(input: {
  first_name?: string;
  last_name?: string;
  name?: string;
  organization_name?: string;
  domain?: string;
  reveal_personal_emails?: boolean;
}): Promise<{ person: ApolloPerson | null }> {
  return call("/people/match", {
    ...input,
    reveal_personal_emails: input.reveal_personal_emails ?? false,
  });
}

export async function apolloOrgSearch(input: {
  q_organization_name?: string;
  organization_locations?: string[];
  per_page?: number;
}): Promise<{ organizations: ApolloOrg[] }> {
  return call("/mixed_companies/search", {
    page: 1,
    per_page: Math.min(input.per_page ?? 5, 25),
    q_organization_name: input.q_organization_name,
    organization_locations: input.organization_locations,
  });
}
