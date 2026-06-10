interface ClearbitCompany {
  name: string;
  domain: string;
  logo: string;
}

/** Free Clearbit autocomplete — no API key required */
export async function enrichFromEmail(email: string): Promise<{
  company: string | null;
  logo: string | null;
  domain: string | null;
} | null> {
  try {
    const domain = email.split("@")[1];
    if (!domain) return null;
    // Skip common personal email providers
    const personal = ["gmail.com","yahoo.com","hotmail.com","outlook.com","icloud.com","aol.com","protonmail.com","me.com"];
    if (personal.includes(domain.toLowerCase())) return null;

    const res  = await fetch(
      `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(domain)}`,
      { next: { revalidate: 86400 } } // cache 24h
    );
    if (!res.ok) return null;
    const companies = await res.json() as ClearbitCompany[];
    const match = companies.find(c => c.domain === domain || domain.includes(c.domain)) ?? companies[0];
    if (!match) return null;
    return { company: match.name, logo: match.logo, domain: match.domain };
  } catch { return null; }
}
