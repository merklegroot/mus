import { inferArtistTitleFromFilename } from "@/lib/inferArtistTitleFromFilename";

test('detects artist "Pearl Jam" from underscore-separated filename', () => {
  const result = inferArtistTitleFromFilename(
    "Pearl_Jam_-_Elderly_Woman_Behind_the_Counter_in_a_Small_Town_Official_Audio",
  );
  expect(result.primary.artist).toBe("Pearl Jam");
  expect(result.primary.title).toBe(
    "Elderly Woman Behind the Counter in a Small Town",
  );
});

test('detects artist/title from spaced "Artist - Title.mp3" filenames', () => {
  const result = inferArtistTitleFromFilename(
    "Pearl Jam - Elderly Woman Behind the Counter in a Small Town.mp3",
  );
  expect(result.primary.artist).toBe("Pearl Jam");
  expect(result.primary.title).toBe(
    "Elderly Woman Behind the Counter in a Small Town",
  );
});

test('strips "Remastered" from numbered track filenames', () => {
  const result = inferArtistTitleFromFilename(
    "01 - Where The Streets Have No Name (Remastered).mp3",
  );
  expect(result.primary.title).toBe("Where The Streets Have No Name");
});

