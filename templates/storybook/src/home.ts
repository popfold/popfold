// The starter's home: a pop-up storybook (the book shell). Its pages, the scene on each and where every piece
// stands are data: home.json. The pop-ups are built into Popfold (card, stand, vfold, box, fan), made of plain
// card and simple shapes, so this site needs no model files and no code of its own to build them.
//
// A kind of your own goes in `kinds` below: any object, built facing +z and standing on y = 0, is mounted on its
// page like a stand (it lies down as the page closes).
import json from './home.json';
import { homeFromFile, type PieceKind } from 'popfold';

const kinds: Record<string, PieceKind> = {};

// The home and its story come from home.json (checked: a mistake in the file is reported in words).
export const { recipe: BOOK, beats: BEATS, transitions: LINKS } = homeFromFile(json, { kinds });
