// The studio page's markup: the stage and the control panel. mountStudio() puts it in <body>.
export const studioMarkup = (siteUrl: string) => `
  <div class="studio-stage" data-backdrop="paper">
    <canvas id="scene" aria-label="Pocket home preview"></canvas>
    <div class="studio-hud" aria-live="polite">
      <span class="hud-home" id="hud-home">Playful</span>
      <span class="hud-stop" id="hud-stop">Closed</span>
    </div>
    <div class="studio-loading" id="loading">Unfolding…</div>
    <section class="library" id="library" aria-labelledby="library-title" hidden>
      <div class="library-top">
        <h2 id="library-title">Every object <span id="library-count"></span></h2>
        <button class="chip" id="library-close" type="button" aria-label="Close the object view">×</button>
      </div>
      <input type="search" id="library-search" placeholder="Find a kind or a file" aria-label="Find a kind or a file" spellcheck="false" autocomplete="off" />
      <div class="chips" id="library-filter" role="radiogroup" aria-label="Show"></div>
      <div class="library-to">
        <label><span>Add to</span><select id="library-room"></select></label>
        <label class="switch"><input type="checkbox" id="library-wall" /><span>On the wall</span></label>
      </div>
      <p class="hint" id="library-note" role="status"></p>
      <div class="library-grid" id="library-grid"></div>
    </section>
  </div>

  <aside class="studio-panel" aria-label="Studio controls">
    <header class="studio-brand">
      <span class="brand-mark" aria-hidden="true"></span>
      <div>
        <h1>Popfold <em>Studio</em></h1>
        <p>Workbench for pocket homes</p>
      </div>
      <a class="studio-link" href="${siteUrl}" title="Open the site">Site ↗</a>
    </header>

    <section class="group">
      <h2>Home</h2>
      <div class="homes" id="homes" role="radiogroup" aria-label="Pocket home"></div>
    </section>

    <section class="group">
      <div class="group-head">
        <h2>Story</h2>
        <button class="chip chip-play" id="play" aria-pressed="false">▶ Play</button>
      </div>
      <label class="slider">
        <span>Scroll position <output id="stage-out">0.00</output></span>
        <input type="range" id="stage" min="0" max="7" step="0.01" value="0" />
      </label>
      <div class="chips" id="stops"></div>
      <div class="beat-edit" id="beat-edit" hidden>
        <div class="row">
          <input type="text" id="beat-name" aria-label="This beat's name" spellcheck="false" />
          <button class="chip" id="beat-left" type="button" title="Move this beat earlier" aria-label="Move this beat earlier">←</button>
          <button class="chip" id="beat-right" type="button" title="Move this beat later" aria-label="Move this beat later">→</button>
          <button class="chip" id="beat-remove" type="button">Remove…</button>
        </div>
        <details class="add-piece" id="beat-add">
          <summary id="beat-add-summary">Add a beat after this one</summary>
          <div class="xyz">
            <label><span>Id</span><input type="text" id="beat-add-id" spellcheck="false" autocomplete="off" placeholder="team" /></label>
            <label><span>Name</span><input type="text" id="beat-add-name" autocomplete="off" placeholder="Team" /></label>
          </div>
          <div class="row"><button class="chip" id="beat-add-do" type="button">Add the beat and its section</button></div>
          <p class="hint">Its section goes into the page after this one, with the name as its heading and a placeholder for its words. It starts as a copy of this beat: then set its camera and folds.</p>
        </details>
        <p class="hint" id="beat-note" role="status" hidden></p>
      </div>
    </section>

    <section class="group">
      <div class="group-head">
        <h2>Fold</h2>
        <label class="switch"><input type="checkbox" id="manual" /><span>Manual</span></label>
      </div>
      <div class="row fold-style">
        <span class="row-label">Fold style</span>
        <div class="seg" id="fold-style" role="radiogroup" aria-label="Fold style"></div>
      </div>
      <div class="folds" id="folds"></div>
      <div class="row" id="fold-save" hidden>
        <button class="chip" id="fold-set" type="button"></button>
      </div>
      <p class="hint" id="fold-note" role="status" hidden></p>
    </section>

    <section class="group" id="look" hidden>
      <h2>Look</h2>
      <div class="look-fields" id="look-fields"></div>
      <p class="hint" id="look-note" role="status" hidden></p>
    </section>

    <section class="group" id="links" hidden>
      <div class="group-head">
        <h2>Links</h2>
        <button class="chip" id="link-add" type="button">Add a link here</button>
      </div>
      <div class="link-list" id="link-list"></div>
      <p class="hint" id="link-note" role="status" hidden></p>
      <p class="hint">A link takes a visitor from one section to another: a card on the page without 3D, and in 3D the piece that takes it (a door, or a button on its story card) and a button in the section.</p>
    </section>

    <section class="group">
      <h2>Camera</h2>
      <div class="chips" id="cams" role="radiogroup" aria-label="Camera"></div>
      <p class="hint" id="cam-note" role="status" hidden></p>
      <p class="hint" id="orbit-hint" hidden>Drag to orbit, scroll to zoom, right-drag to pan.</p>
      <div class="cam-out" id="cam-out" hidden>
        <code id="cam-values" aria-live="off"></code>
        <button class="chip" id="cam-copy" type="button">Copy for a beat</button>
        <button class="chip" id="cam-set" type="button"></button>
        <p class="hint">The camera's position, then the point it looks at: the two arrays of a beat.</p>
      </div>
    </section>

    <section class="group" id="inspector">
      <div class="group-head">
        <h2>Props</h2>
        <button class="chip" id="library-open" type="button" aria-expanded="false" aria-controls="library">Every object</button>
        <label class="switch"><input type="checkbox" id="inspect" /><span>Pick in view</span></label>
      </div>
      <label class="field-select">
        <span class="visually-hidden">Prop</span>
        <select id="prop-list"><option value="">Choose a prop…</option></select>
      </label>
      <div class="prop-editor" id="prop-editor" hidden>
        <div class="row">
          <span class="row-label">Handles</span>
          <div class="seg" id="gizmo-mode" role="radiogroup" aria-label="Handles"></div>
        </div>
        <div class="xyz">
          <label><span>X</span><input type="number" step="0.01" id="px" /></label>
          <label><span>Y</span><input type="number" step="0.01" id="py" /></label>
          <label><span>Z</span><input type="number" step="0.01" id="pz" /></label>
          <label><span>Turn°</span><input type="number" step="1" id="ry" /></label>
          <label><span>Size×</span><input type="number" step="0.05" min="0.05" id="ps" /></label>
        </div>
        <label class="kind-row" id="pkind-row" hidden><span>Kind</span><select id="pkind"></select></label>
        <div class="row">
          <label class="switch"><input type="checkbox" id="phide" /><span>Hidden</span></label>
          <button class="chip" id="preset" type="button">Reset to default</button>
          <button class="chip" id="premove" type="button" hidden>Remove…</button>
        </div>
        <p class="hint">Positions are in the room's own units (rooms are 4 wide). Keys: W move · E rotate · Esc deselect · Ctrl+Z undo.</p>
        <details class="story-edit" id="story-edit" hidden>
          <summary id="story-summary">Story</summary>
          <label><span>Title</span><input type="text" id="story-title" /></label>
          <label><span>Text</span><textarea id="story-text" rows="4"></textarea></label>
          <label><span>Tags, separated by commas</span><input type="text" id="story-tags" /></label>
          <label><span>The dot sits</span><select id="story-dot"><option value="top">above the piece</option><option value="front">in front of it (wall pieces)</option><option value="below">below it (hanging pieces)</option></select></label>
          <div class="row">
            <button class="chip" id="story-save" type="button">Save story</button>
            <button class="chip" id="story-remove" type="button">No story</button>
          </div>
          <p class="hint">The card a visitor opens from the dot on this piece, and a paragraph on the page without 3D.</p>
        </details>
      </div>
      <div class="layout-bar">
        <span id="layout-count">No changes</span>
        <div class="layout-actions">
          <button class="chip" id="layout-undo" type="button" title="Undo (Ctrl+Z)" aria-label="Undo" disabled>↶</button>
          <button class="chip" id="layout-redo" type="button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled>↷</button>
          <button class="chip" id="layout-save" type="button">Save</button>
          <button class="chip" id="layout-download" type="button">JSON</button>
        </div>
      </div>
      <p class="hint" id="layout-status" role="status"></p>
      <details class="add-piece" id="add-piece" hidden>
        <summary>Add a piece</summary>
        <div class="xyz">
          <label><span>Kind</span><select id="add-kind"></select></label>
          <label><span>Room</span><select id="add-room"></select></label>
          <label><span>Id</span><input type="text" id="add-id" spellcheck="false" autocomplete="off" placeholder="reading-lamp" /></label>
        </div>
        <div class="row">
          <label class="switch"><input type="checkbox" id="add-wall" /><span>On the wall</span></label>
          <button class="chip" id="add-do" type="button">Add to the home</button>
        </div>
        <p class="hint">It is written into the home file and appears in the middle of its room; then move it and save.</p>
      </details>
    </section>

    <section class="group">
      <h2>Scene</h2>
      <div class="toggles" id="toggles"></div>
      <div class="row">
        <span class="row-label">Lighting</span>
        <div class="seg" id="lighting" role="radiogroup" aria-label="Lighting"></div>
      </div>
      <div class="row">
        <span class="row-label">Speed</span>
        <div class="seg" id="speed" role="radiogroup" aria-label="Animation speed"></div>
      </div>
      <div class="row">
        <span class="row-label">Beige ↔ color</span>
        <input type="range" id="beige" min="0" max="100" value="100" aria-label="Beige to full color" />
      </div>
      <div class="row">
        <span class="row-label">Backdrop</span>
        <div class="seg" id="backdrop" role="radiogroup" aria-label="Backdrop"></div>
      </div>
    </section>

    <section class="group actions">
      <button class="btn" id="replay">Replay pop-in</button>
      <button class="btn" id="snap">Snapshot PNG</button>
      <button class="btn" id="link">Copy link</button>
    </section>
  </aside>
`;
