import { describe, expect, it } from "vitest";
import { buildGhlPostBody, ghlMediaType } from "./ghl-api.server";

const base = {
  accountIds: ["acc1"],
  userId: "user1",
  caption: "Hello Dubai",
  media: [{ url: "https://x/y.jpg", type: "image/jpeg" }],
};

describe("buildGhlPostBody (GHL Create Post shape)", () => {
  it("publishes now with the documented fields", () => {
    const b = buildGhlPostBody(base);
    expect(b).toMatchObject({
      type: "post",
      accountIds: ["acc1"],
      userId: "user1",
      summary: "Hello Dubai",
      media: [{ url: "https://x/y.jpg", type: "image/jpeg" }],
      status: "published",
    });
    expect(b).not.toHaveProperty("scheduleDate");
    expect(b).not.toHaveProperty("medias");
    expect(b).not.toHaveProperty("googleMyBusiness");
  });

  it("schedules future posts with scheduleDate", () => {
    const when = new Date(Date.now() + 3 * 86400_000).toISOString();
    const b = buildGhlPostBody({ ...base, scheduleAt: when });
    expect(b.status).toBe("scheduled");
    expect(b.scheduleDate).toBe(when);
  });

  it("publishes immediately when the schedule time already passed", () => {
    const b = buildGhlPostBody({
      ...base,
      scheduleAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(b.status).toBe("published");
  });

  it("maps CTA to gmbPostDetails (any case), url omitted for call", () => {
    expect(
      buildGhlPostBody({ ...base, ctaType: "BOOK", ctaUrl: "https://b" }).gmbPostDetails,
    ).toEqual({
      gmbEventType: "STANDARD",
      actionType: "book",
      url: "https://b",
    });
    expect(buildGhlPostBody({ ...base, ctaType: "call", ctaUrl: "+971" }).gmbPostDetails).toEqual({
      gmbEventType: "STANDARD",
      actionType: "call",
    });
    expect(buildGhlPostBody({ ...base, ctaType: "none" })).not.toHaveProperty("gmbPostDetails");
  });

  it("creates drafts", () => {
    expect(
      buildGhlPostBody({
        ...base,
        draft: true,
        scheduleAt: new Date(Date.now() + 1e9).toISOString(),
      }).status,
    ).toBe("draft");
  });
});

describe("ghlMediaType", () => {
  it("maps allowed types and rejects webp", () => {
    expect(ghlMediaType("a/b.JPG")).toBe("image/jpeg");
    expect(ghlMediaType("a/b.png")).toBe("image/png");
    expect(ghlMediaType("a/b.webp")).toBeNull();
  });
});
