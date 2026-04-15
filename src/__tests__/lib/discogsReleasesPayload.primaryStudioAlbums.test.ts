import {
  selectPrimaryStudioAlbums,
  type DiscogsReleaseListItem,
} from "@/lib/discogsReleasesPayload";

function r(
  partial: Partial<DiscogsReleaseListItem> & Pick<DiscogsReleaseListItem, "id" | "title" | "type">,
): DiscogsReleaseListItem {
  return {
    id: partial.id,
    type: partial.type,
    title: partial.title,
    year: partial.year ?? null,
    format: partial.format ?? null,
    formats: partial.formats,
    label: partial.label ?? null,
    role: partial.role ?? null,
    thumb: partial.thumb ?? null,
  };
}

function normTitleForAssert(title: string): string {
  return title
    .trim()
    .replace(
      /\s*[\(\[]\s*(remaster(?:ed)?|deluxe( edition)?|anniversary( edition)?|expanded|reissue|re-release|bonus tracks?)\s*[\)\]]\s*$/i,
      "",
    )
    .trim()
    .toLowerCase();
}

describe("Discogs primary studio album filtering", () => {
  test("should return exactly the 12 primary studio albums for Pearl Jam and exclude all live/compilation/single noise", () => {
    const releases: DiscogsReleaseListItem[] = [
      // 12 primary studio albums (masters, Main).
      r({
        id: 1001,
        type: "master",
        role: "Main",
        title: "Ten",
        year: 1991,
        formats: [{ descriptions: ["Album", "LP"] }],
      }),
      r({
        id: 1002,
        type: "master",
        role: "Main",
        title: "Vs.",
        year: 1993,
        formats: [{ descriptions: ["Album", "LP"] }],
      }),
      r({
        id: 1003,
        type: "master",
        role: "Main",
        title: "Vitalogy",
        year: 1994,
        formats: [{ descriptions: ["Album", "LP"] }],
      }),
      r({
        id: 1004,
        type: "master",
        role: "Main",
        title: "No Code",
        year: 1996,
        formats: [{ descriptions: ["Album", "LP"] }],
      }),
      r({
        id: 1005,
        type: "master",
        role: "Main",
        title: "Yield",
        year: 1998,
        formats: [{ descriptions: ["Album", "LP"] }],
      }),
      r({
        id: 1006,
        type: "master",
        role: "Main",
        title: "Binaural",
        year: 2000,
        formats: [{ descriptions: ["Album", "LP"] }],
      }),
      r({
        id: 1007,
        type: "master",
        role: "Main",
        title: "Riot Act",
        year: 2002,
        formats: [{ descriptions: ["Album", "LP"] }],
      }),
      r({
        id: 1008,
        type: "master",
        role: "Main",
        title: "Pearl Jam",
        year: 2006,
        formats: [{ descriptions: ["Album", "LP"] }],
      }),
      r({
        id: 1009,
        type: "master",
        role: "Main",
        title: "Backspacer",
        year: 2009,
        formats: [{ descriptions: ["Album", "LP"] }],
      }),
      r({
        id: 1010,
        type: "master",
        role: "Main",
        title: "Lightning Bolt",
        year: 2013,
        formats: [{ descriptions: ["Album", "LP"] }],
      }),
      r({
        id: 1011,
        type: "master",
        role: "Main",
        title: "Gigaton",
        year: 2020,
        formats: [{ descriptions: ["Album", "LP"] }],
      }),
      r({
        id: 1012,
        type: "master",
        role: "Main",
        title: "Dark Matter",
        year: 2024,
        formats: [{ descriptions: ["Album", "LP"] }],
      }),

      // Noisy items (should be excluded).
      r({
        id: 2001,
        type: "release",
        role: "Main",
        title: "Sea.Hear.Now Asbury Park, NJ September 18th, 2021",
        year: 2021,
        formats: [{ descriptions: ["CDr", "Live", "Tour"] }],
        label: "Nugs.net",
      }),
      r({
        id: 2002,
        type: "release",
        role: "Main",
        title: "Ohana Festival Dana Point, CA October 2nd, 2021",
        year: 2021,
        formats: [{ descriptions: ["CD", "Live", "Tour"] }],
        label: "Nugs.net",
      }),
      r({
        id: 2003,
        type: "master",
        role: "Main",
        title: "Live On Two Legs",
        year: 1998,
        formats: [{ descriptions: ["Live", "Album", "CD"] }],
      }),
      r({
        id: 2004,
        type: "master",
        role: "Main",
        title: "Lost Dogs",
        year: 2003,
        formats: [{ descriptions: ["Compilation", "Album", "CD"] }],
      }),
      r({
        id: 2005,
        type: "master",
        role: "Main",
        title: "Rearviewmirror (Greatest Hits 1991-2003)",
        year: 2004,
        formats: [{ descriptions: ["Compilation", "CD"] }],
      }),
      r({
        id: 2006,
        type: "master",
        role: "Main",
        title: "The Last Of Us",
        year: 2023,
        formats: [{ descriptions: ["Soundtrack", "LP", "Vinyl"] }],
      }),
      r({
        id: 2007,
        type: "master",
        role: "Main",
        title: "Jeremy",
        year: 1992,
        formats: [{ descriptions: ["Single", "7\""] }],
      }),
      r({
        id: 2008,
        type: "master",
        role: "Main",
        title: "Alive (Promo)",
        year: 1991,
        formats: [{ descriptions: ["Promo", "Single", "CD"] }],
      }),
      r({
        id: 2009,
        type: "master",
        role: "Main",
        title: "Unplugged",
        year: 1992,
        formats: [{ descriptions: ["Live", "Bootleg"] }],
      }),
      r({
        id: 2010,
        type: "master",
        role: "Main",
        title: "Ten (Remastered)",
        year: null,
        formats: [{ descriptions: ["Album", "LP", "Remastered"] }],
      }),
      r({
        id: 2011,
        type: "master",
        role: "Main",
        title: "Yield (Deluxe Edition)",
        year: 2017,
        formats: [{ descriptions: ["Album", "CD", "Deluxe"] }],
      }),
      r({
        id: 2012,
        type: "release",
        role: "Main",
        title: "Pearl Jam - Ten (2016 Remaster)",
        year: 2016,
        formats: [{ descriptions: ["Album", "CD", "Remastered"] }],
      }),
      r({
        id: 2013,
        type: "master",
        role: "Main",
        title: "Christmas Single 1998",
        year: 1998,
        formats: [{ descriptions: ["Single", "Fan Club"] }],
      }),
      r({
        id: 2014,
        type: "master",
        role: "Main",
        title: "Tour 2000 Bootleg Series",
        year: 2000,
        formats: [{ descriptions: ["Live", "Bootleg", "CDr", "Tour"] }],
      }),
      r({
        id: 2015,
        type: "master",
        role: "Main",
        title: "Benaroya Hall",
        year: 2003,
        formats: [{ descriptions: ["Live", "Album", "CD"] }],
      }),
      // Wrong role/type should be excluded even if it looks album-ish.
      r({
        id: 2016,
        type: "master",
        role: "Featuring",
        title: "Ten",
        year: 1991,
        formats: [{ descriptions: ["Album", "LP"] }],
      }),
      r({
        id: 2017,
        type: "release",
        role: "Main",
        title: "Gigaton",
        year: 2020,
        formats: [{ descriptions: ["Album", "LP"] }],
      }),
    ];

    const result = selectPrimaryStudioAlbums(releases);

    expect(result).toHaveLength(12);

    const simplified = result.map((x) => ({
      title: normTitleForAssert(x.title),
      year: x.canonicalYear,
    }));

    expect(simplified).toEqual([
      { title: "ten", year: 1991 },
      { title: "vs.", year: 1993 },
      { title: "vitalogy", year: 1994 },
      { title: "no code", year: 1996 },
      { title: "yield", year: 1998 },
      { title: "binaural", year: 2000 },
      { title: "riot act", year: 2002 },
      { title: "pearl jam", year: 2006 },
      { title: "backspacer", year: 2009 },
      { title: "lightning bolt", year: 2013 },
      { title: "gigaton", year: 2020 },
      { title: "dark matter", year: 2024 },
    ]);
  });

  test("should handle missing year gracefully", () => {
    const releases: DiscogsReleaseListItem[] = [
      r({
        id: 3001,
        type: "master",
        role: "Main",
        title: "Ten",
        year: 1991,
        formats: [{ descriptions: ["Album", "LP"] }],
      }),
      r({
        id: 3002,
        type: "master",
        role: "Main",
        title: "Vs.",
        year: null,
        formats: [{ descriptions: ["Album", "LP"] }],
      }),
    ];

    const result = selectPrimaryStudioAlbums(releases);
    expect(result).toHaveLength(2);
    expect(result[0]?.canonicalYear).toBe(1991);
    expect(result[1]?.canonicalYear).toBeNull();
  });

  test("should deduplicate duplicate masters of the same album", () => {
    const releases: DiscogsReleaseListItem[] = [
      r({
        id: 4001,
        type: "master",
        role: "Main",
        title: "Ten (Remastered)",
        year: null,
        formats: [{ descriptions: ["Album", "LP", "Remastered"] }],
      }),
      r({
        id: 4002,
        type: "master",
        role: "Main",
        title: "Ten",
        year: 1991,
        formats: [{ descriptions: ["Album", "LP"] }],
      }),
    ];

    const result = selectPrimaryStudioAlbums(releases);
    expect(result).toHaveLength(1);
    expect(normTitleForAssert(result[0]!.title)).toBe("ten");
    expect(result[0]!.canonicalYear).toBe(1991);
  });
});

/**
 * Expanding this test to other artists:
 * - Copy the "12 studio albums + noise" pattern and adjust expected titles/years.
 * - Add artist-specific noise titles (e.g. common live series names, box sets).
 * - If you find a false positive/negative, add a minimal repro row and tune the
 *   blacklist / looksLikeAlbum heuristics in `src/lib/discogsReleasesPayload.ts`.
 */

