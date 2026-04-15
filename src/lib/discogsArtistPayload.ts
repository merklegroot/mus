export type DiscogsArtistImage = {
  type?: string;
  uri?: string;
  uri150?: string;
  resource_url?: string;
};

export type DiscogsArtistMember = {
  id?: number;
  name?: string;
  active?: boolean;
};

export type DiscogsArtistAlias = {
  id?: number;
  name?: string;
};

/** Fields we read from cached Discogs GET /artists/{id} JSON. */
export type DiscogsArtistPayload = {
  name?: string;
  id?: number;
  uri?: string;
  profile?: string;
  urls?: string[];
  images?: DiscogsArtistImage[];
  members?: DiscogsArtistMember[];
  aliases?: DiscogsArtistAlias[];
  namevariations?: string[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function parseDiscogsArtistJson(dataJson: string): DiscogsArtistPayload | null {
  try {
    const raw = JSON.parse(dataJson) as unknown;
    if (!isRecord(raw)) return null;
    const out: DiscogsArtistPayload = {};

    if (typeof raw.name === "string") out.name = raw.name;
    if (typeof raw.id === "number" && Number.isFinite(raw.id)) out.id = raw.id;
    if (typeof raw.uri === "string") out.uri = raw.uri;
    if (typeof raw.profile === "string") out.profile = raw.profile;

    if (Array.isArray(raw.urls)) {
      out.urls = raw.urls.filter((u): u is string => typeof u === "string");
    }

    if (Array.isArray(raw.images)) {
      out.images = raw.images.filter(isRecord).map((img) => {
        const i: DiscogsArtistImage = {};
        if (typeof img.type === "string") i.type = img.type;
        if (typeof img.uri === "string") i.uri = img.uri;
        if (typeof img.uri150 === "string") i.uri150 = img.uri150;
        if (typeof img.resource_url === "string") i.resource_url = img.resource_url;
        return i;
      });
    }

    if (Array.isArray(raw.members)) {
      out.members = raw.members.filter(isRecord).map((m) => {
        const mem: DiscogsArtistMember = {};
        if (typeof m.id === "number" && Number.isFinite(m.id)) mem.id = m.id;
        if (typeof m.name === "string") mem.name = m.name;
        if (typeof m.active === "boolean") mem.active = m.active;
        return mem;
      });
    }

    if (Array.isArray(raw.aliases)) {
      out.aliases = raw.aliases.filter(isRecord).map((a) => {
        const al: DiscogsArtistAlias = {};
        if (typeof a.id === "number" && Number.isFinite(a.id)) al.id = a.id;
        if (typeof a.name === "string") al.name = a.name;
        return al;
      });
    }

    if (Array.isArray(raw.namevariations)) {
      out.namevariations = raw.namevariations.filter(
        (n): n is string => typeof n === "string",
      );
    }

    return out;
  } catch {
    return null;
  }
}

export function primaryDiscogsImage(
  images: DiscogsArtistImage[] | undefined,
): DiscogsArtistImage | undefined {
  if (!images?.length) return undefined;
  const primary = images.find((i) => i.type === "primary");
  return primary ?? images[0];
}
