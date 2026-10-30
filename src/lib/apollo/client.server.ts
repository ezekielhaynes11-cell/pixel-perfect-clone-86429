// Thin wrapper around the Apollo.io REST API.
// Docs: https://docs.apollo.io/reference

import { logWarn } from "../logger.server";
import { tryConsumeApolloCall } from "./quota.server";

const APOLLO_BASE = "https://api.apollo.io/api/v1";
const TIMEOUT_MS = 15_000;

export class ApolloCapError extends Error {
  constructor() {
    super(
      "Apollo request blocked: daily cap reached or usage could not be verified. Try again later.",
    );
    this.name = "ApolloCapError";
  }
}

export function hasApolloApiKey(): boolean {
  return Boolean(process.env.APOLLO_API_KEY && process.env.APOLLO_API_KEY.trim().length > 0);
}

function key(): string {
  const apiKey = process.env.APOLLO_API_KEY?.trim();
  if (!apiKey) throw new Error("APOLLO_API_KEY is not configured");
  return apiKey;
}

function extractApolloErrorDetail(rawText: string): string {
  const fallback = rawText.slice(0, 200);
  if (!rawText.trim().startsWith("{")) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(rawText) as { message?: string; error?: string };
    return parsed.message ?? parsed.error ?? fallback;
  } catch (err) {
    logWarn("apollo.client", "Non-JSON error body from Apollo", {
      error: err instanceof Error ? err.message : String(err),
    });
    return fallback;
  }
}

async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const apiKey = key();
  if (!(await tryConsumeApolloCall())) throw new ApolloCapError();

  const response = await fetch(`${APOLLO_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    const text = await response.text();
    logWarn("apollo.client", "Apollo endpoint returned non-OK status", {
      path,
      status: response.status,
      detail: text.slice(0, 300),
    });
    if (response.status === 429) throw new Error("Apollo rate limit hit — try again in a minute.");
    if (response.status === 402) throw new Error("Apollo credits exhausted.");
    if (response.status === 401) throw new Error("Apollo API key rejected.");
    if (response.status === 403) {
      throw new Error(`Apollo 403 forbidden on ${path} — endpoint may require a paid plan.`);
    }
    const detail = extractApolloErrorDetail(text);
    throw new Error(`Apollo ${path} ${response.status}: ${detail}`);
  }
  return (await response.json()) as T;
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
  const payload = {
    page: input.page ?? 1,
    per_page: Math.min(input.per_page ?? 25, 100),
    person_titles: input.person_titles,
    q_keywords: input.q_keywords,
    person_locations: input.person_locations,
    organization_locations: input.organization_locations,
    organization_name: input.organization_name,
  };
  try {
    return await call("/mixed_people/search", payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("403") || msg.includes("404") || msg.includes("422")) {
      return call("/mixed_people/api_search", payload);
    }
    throw err;
  }
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
