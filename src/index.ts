// Popfold: scroll-driven 3D "pocket homes" that unfold into rooms.
//
//   startScene()   the engine: renders a home, plays the story keyframes, picks rooms and stories
//   HomeRecipe     a home: look, props, furnish() placing its pieces, optional stories and fold style
//   beat()         build the story: one beat per page section (its id, a name, a keyframe)
//   P, C, tex      built-in pieces, a palette and canvas textures for furnish() and looks
//   createStoryCard()  the "why it's here" card for prop stories
export { startScene, type SceneOptions, type SceneFlags, type FoldStyle, type Lighting, type LightPreset } from './engine';
export { debugAvailable, installDebug, toggleDebug, type DebugSource } from './debug-hook';
export { pieceKey, readHome, storiesOf, type FloorData, type HomeData, type LookData, type SurfaceData } from './pieces';
export { homeFromFile, lookFromData, surface, type HomeCode } from './home-file';
export { doorsOf, storiesWithLinks, transitionHref, transitionTarget, type Transition } from './transitions';
export { BUILT_IN_EFFECTS, type Effect } from './effects-pass';
export type { BookContext, HomeRecipe, Look, FurnishContext, ModelOptions, PieceKind, PieceSpec, PropStory, Lamp } from './types';
export { BEAT_DEFAULTS, FIELDS, beat, beatFromData, beatsOf, keyframe, sample, type Beat, type BeatData, type State, type Field } from './keyframes';
export { P, W, D, BASE_H, LID_H, DRAWER_OUT, DRAWER_FLOOR, type PopItem, type Room, type GenAssets } from './compact';
export { registerShell, shellOf, allShells, type Shell, type House, type ShellEnv, type ShellZone, type FrameContext, type FrameResult } from './shell';
export { bookShell, compactShell, dioramaShell, towerShell } from './shells';
export { C, DEFAULT_PALETTE, setPalette, toy, rbox, type Palette } from './props';
export * as tex from './textures';
export { applyEntry, applyPlaces, entryFor, piece, placementChange, type Editable, type Listed, type Placement, type Places, type Place } from './layout';
export { createStoryCard } from './story-card';
export { pageLang, t } from './text';
export type { DioramaSpec } from './diorama';
export type { TowerSpec, FloorSpec, FloorContext } from './tower';
export { POPUP_KINDS, type BookPage, type BookSpec } from './book';
export { aida, stitchGrid, stitcher, type StitchGrid } from './stitch';
export { box, card, cardMesh, cutout, fan, paper, stand, standFor, vfold, SHAPES, type Popup, type PopupOpts, type ShapeName } from './popup';
export { bisector, gableRise, halfOpen, leafAngles, openness, spreadsOf, standAngle, vfoldCrease, type SpreadAngles } from './popup-math';
export { foldEase, hinge, HINGE_EDGES, type Hinge, type HingeEdge } from './fold';
export { Flow, type FlowOptions } from './flow';
