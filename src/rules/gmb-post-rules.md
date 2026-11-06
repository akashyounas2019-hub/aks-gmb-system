# GMB Post Generation Rules

These rules are sent to the LLM as part of the system prompt every time a
Google Business Profile post is generated (`composePost` in
`src/lib/post-generator.functions.ts`). Edit this file to change how posts are
written. Keep each rule short and unambiguous.

## Location keywords

1. The user's **Location Keywords** (Keywords → Location Keywords tab) are the
   areas the business serves. For every post the app picks a **random**
   selection of them and passes it as `LOCATION KEYWORDS`.
2. When `LOCATION KEYWORDS` are provided, mention **every one of them**
   naturally in the post. A short line such as
   `Serving: <area>, <area>, <area>` near the end is acceptable.
3. Never invent extra locations that were not provided.

## Geo-tagged image locations

4. When `GEO-TAGGED IMAGE LOCATIONS` are provided, the post **must** mention
   each of those locations by name. This is mandatory, not optional.
5. Treat a geo-tagged image location as the place where the pictured job was
   done (e.g. "…a deep clean we completed in Dubai Marina"). Mention it within
   the first two sentences.
6. Never print raw latitude/longitude coordinates in the post text.

## General

7. If both a job location and location keywords are present, the job location
   is where the work happened; the location keywords are the wider service
   area. Keep the two distinct.
