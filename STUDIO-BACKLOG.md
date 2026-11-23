# Popfold Studio: outstanding work

The studio track's backlog, kept by the owner. Add items anywhere below; the studio session works from this file,
top to bottom, and asks before anything marked **decide**.

As of Popfold 0.48.0 (last brought up to date; the list is the owner's). Done so far (TODO.md section 4): editing every piece, the look, stories, beat cameras and
what each beat does; links; a tower's colours; stills for every home; the time of day said once; adding, removing
and moving beats; drafts; undo and redo of edits and saves; one command list shared with `popfold mcp`.

## Waiting on a decision

- [ ] **Save from anywhere** (M to L). Decided by the owner, 2026-11-22: design B (command replay) on Cloudflare
      first, with users who sign themselves up. Since 0.51.0 a built studio already keeps its edits in the browser
      for 24 hours and downloads the file; this saves them into the site's repository instead.
      - **Status (2026-11-22):** built, not released or deployed: `save/` (the Worker, with tests), `homeSaver({ save })`
        (writes `popfold-save.json`) and *Save to GitHub* in the studio's kept-edits note. Next: the owner creates
        the Popfold GitHub App (`save/README.md`), then a test on a real repository, then `save.popfold.ca` after the
        domain moves (ops/cloudflare-split.md).
      - **The service:** one Worker at `save.popfold.ca`, in Popfold's own Cloudflare account. It is written in
        TypeScript against the web-standard `fetch(Request) → Response`, so the same core can later run locally
        (`popfold serve`) and on Azure (Functions v4 on Node, or Container Apps) behind a thin wrapper each. Anyone
        can also deploy their own copy with their own GitHub App.
      - **Command replay:** the studio sends `{ repo, branch, home, base, commands }` (`base`: the file's version the
        edits started from). The Worker fetches the newest home file and page from GitHub, runs the same
        `runCommands` (`src/home-commands.ts`; parse5 for the page's sections), checks the result with `readHome`,
        and commits the file and, for beats, the page. Edits by two people merge unless they touch the same piece,
        which comes back as a conflict that says which.
      - **Users are GitHub's, not ours.** A Popfold GitHub App (contents, and pull requests for branches):
        - a site's owner signs up by installing the app on the site's repository: no form, no approval;
        - an editor signs up by "Sign in with GitHub" in the studio; the Worker asks GitHub whether they may write
          to that repository, and if not the studio says so and keeps the edits in the browser;
        - commits are made with the editor's own token (a GitHub App user token), so they carry the editor's name
          and GitHub enforces the repository's rules (protected branches, reviews); losing access to the repository
          loses saving, with nothing to clean up here.
      - **Nothing much stored:** sessions as a signed token (or KV); D1 only later, for an audit log or invites.
        The GitHub App's private key is a Worker secret.
      - **Sign-in across domains:** the studio is on the site's domain and the Worker on popfold.ca, so sign-in is
        a pop-up that hands back a short-lived token (no third-party cookies). CORS allows only the origins of
        sites that have the app installed.
      - **Later:** people without GitHub (by e-mailed one-time link through Cloudflare Email, with a role per site
        kept in D1, the app committing for them and naming them in the commit); Azure and local wrappers.
      - Cloudflare Access is not for this (50 free seats, policies by hand); it stays for the owner's own tools.
      - **decide:** commit to a branch per editor (`studio/<login>`, with a pull request) or straight to the
        branch the site deploys from? Should a commit deploy the site (CI is off until 1.0.0)?
- [ ] **Full mode** (L) **decide:** a chat panel in the studio that drives the command list, looks at snapshots,
      and can generate pieces and art into the scene.
      - Which model and whose API key? It goes through a dev-server proxy, so no key reaches the page.
      - Local models (the forge's Ollama) as well, or instead?

## Known gaps

- [x] After adding, removing or moving a beat the studio reloads (its stops are fixed when it mounts): rebuild
      them in place instead. *Done: the stops and the scene take the new beats in place, undo and redo too.*
- [x] The Look group edits homes kept in a file only; a home made in code shows no Look. *Done: it shows its plain
      colours and lid words, tries changes in place and copies them as code for the recipe (its look is code, so
      nothing is saved).*
- [x] A diorama's look is not in the Look group (its art and cover are drawn in code). *Done for its colours: a
      `paint` per material in the home file, edited in the Look group. The art and cover stay code: they are
      drawings, not data (see the idea "A diorama's art from image files").*
- [ ] Saving works on `127.0.0.1` / `localhost` only (see *Save from anywhere*).

## Ideas

<!-- Add yours here: one line each, with what it is for. -->

- [x] **A view of every object available** (owner, 2026-11-21; done in 0.43.0, except its *Later* line): browse all the kinds a home can use (built-in
      pieces, the site's own kinds, model files in `public/models/props/` and shared folders), with a preview, so
      a piece can be picked and added from it.

      *How it could work (studio session, 2026-11-21; size M, L with thumbnails made headlessly):*
      - **What it lists.** Every kind the home on show can use, from four places: the site's own `kinds` (code),
        model files in the home's `propDir` and in `sharedDir` folders (a dev endpoint, `GET /__popfold/library`,
        lists the `.glb` files with their sizes, since the page cannot read folders), and Popfold's built-in pieces
        (`sofa`, `floorLamp`, `plant`, `bed`… in `src/props.ts`). Built-ins are functions with arguments today, not
        kinds a home file can name: this needs a small registry of built-in kinds with plain defaults (`"kind":
        "builtin/sofa"`, say), so a file can use one without code. A kind shows where it is used (in which homes and
        rooms, how many times) and which are unused, so stray model files show up too.
      - **The preview.** A drawer of cards, each a small picture of the piece on a plain floor. The pictures are drawn
        once by the studio's own renderer (one piece at a time in a second, offscreen scene, the same light as the
        home), kept in the browser per kind and file date, and drawn again when a model changes. Hovering a card
        turns its piece slowly in a mini view. A wall piece is shown against a wall, a hanging one from above.
      - **Adding.** A card's **Add to <room>** runs the `add` command (as *Add a piece* does now) with an id made from
        the kind; dragging a card onto the scene adds it where it is dropped (a ray to the room's floor or wall gives
        `at`). The new piece is selected, ready to move.
      - **For agents.** The same list as an MCP tool (`library`) and in `popfold describe`, so an agent can see what
        exists before it adds or generates anything.
      - **Later.** A model file dropped onto the drawer is checked (`popfold optimize`'s rules), copied into the props
        folder and becomes a card; the forge could add a **Make one like this** from a card's brief.

      *Done in part (studio session, 2026-11-21):* the drawer (**Every object**, beside *Props*) with the site's
      kinds, the built-in pieces (now `builtin/<name>` kinds a home file can name) and model files, each with a
      picture drawn by the studio, where it is used and its size; filters, search, and **Add** to a room (selected
      at once); model files a home does not load, greyed; `GET /__popfold/library`; `kinds` in `popfold describe`;
      the MCP tool `library`. *Still to do:* dragging a card onto the scene, the piece turning on hover, pictures
      kept between visits (they are drawn once per visit), and the *Later* items.

- [ ] **A scene tree instead of the prop dropdown** (S): every piece by room, with its story, door and hidden marks,
      a search box, and click to select. For finding a piece in a full room; today it is a long `<select>`.
- [ ] **Edit a section's words** (M): the heading and paragraphs of the section the story is on, edited in the page
      from the studio (the page's own text, as the beat commands already edit it). For writing copy beside the scene
      it sits next to; the words stay the owner's.
- [ ] **See the page beside the home** (M): the section's text card laid over the stage as the site lays it out,
      at a phone and a desktop width. For checking that a door is not under the card, and the home's `side`.
- [ ] **Show beat cameras and routes** (M): in Free orbit, each beat's camera as a small frustum and the path the
      story camera takes between them, a link's `via` points as handles to drag. For framing a story as a whole
      instead of beat by beat.
- [ ] **Play a link's effect** (S): a button on a link that plays its effect over the current view
      (`scene.snapshotEffect` exists), and the door's glow and words on hover. The studio plays no effects today, so
      an effect is only seen on the site.
- [ ] **All beats in one table** (M): beats as rows and their values (rooms, glow, side, a tower's zones) as
      columns, edited in place through the `beat` command. For seeing the story's rhythm at once and fixing one
      value across beats.
- [ ] **Stills in the studio** (S): the stills of the home on show beside its stops, marked when they no longer
      match the beat (after an edit), with a button to capture the stale ones. For keeping the page without 3D right.
- [ ] **Check from the studio** (S): `popfold check`'s findings in a panel, each one selecting the piece, beat or
      link it is about. For fixing mistakes where they are seen.
- [ ] **Move several pieces, snap and nudge** (M): select more than one piece, move or turn them together, snap to
      the floor grid and walls, nudge with the arrow keys, and duplicate a piece with a new id. For laying out a
      room faster and more evenly.
- [ ] **Weight of each piece** (S): triangles, materials and model size per piece and per room, against the site's
      model budget. For keeping a home light before `popfold check` complains.
- [ ] **A diorama's art from image files** (S): `"art": { "art_poster": "images/poster.webp" }` in the home file, so
      a diorama's posters and screens can be swapped in the Look group without code (they are drawn in code today).

## How the studio is tested

On the templates in `templates/` only (compact, tower, diorama), in a real browser, through the command list;
`pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm test:browser` and `popfold stills --check` in every template,
all on this machine (CI is off until 1.0.0).
