// Idea Slot Machine reels. Each symbol reads naturally inside the idea sentence.
// Gold symbols are rarer, stranger, and pay out when several line up.
import type { IconName } from '../common/icons';

export interface Sym { label: string; gold?: boolean; icon: IconName; color: string }
export interface ReelDef { id: string; title: string; symbols: Sym[] }

const S = (label: string, icon: IconName, color: string, gold = false): Sym => ({ label, icon, color, gold });

export const REELS: ReelDef[] = [
  { id: 'genre', title: 'Genre', symbols: [
    S('Roguelike', 'refresh', '#c22a48'), S('Platformer', 'play', '#2f7fd0'), S('Cozy sim', 'idea', '#d07a2f'), S('Puzzle game', 'brain', '#7a4dff'),
    S('Tower defense', 'wrench', '#3f8a2a'), S('Metroidvania', 'search', '#1d6b8a'), S('Rhythm game', 'sound', '#d0308f'), S('Survival crafter', 'wrench', '#6b4a28'),
    S('Deckbuilder', 'tasks', '#8a2a2a'), S('Racing game', 'bolt', '#d0a02f'), S('Farming RPG', 'idea', '#4a8a2a'), S('Stealth game', 'eye', '#3a3a5a'),
    S('Bullet hell', 'star', '#d02f5a'), S('Detective mystery', 'search', '#5a4a2a'), S('City builder', 'folder', '#2a6b6b'), S('Party brawler', 'alien', '#d05a2f'),
    S('Idle clicker', 'refresh', '#2f8ad0'), S('Monster tamer', 'alien', '#8a2fd0', true), S('Immersive sim', 'brain', '#2a2a2a', true), S('MMO for one player', 'user', '#a8650a', true),
  ] },
  { id: 'mechanic', title: 'Core mechanic', symbols: [
    S('grappling-hook swinging', 'bolt', '#2f7fd0'), S('time-loop do-overs', 'refresh', '#7a4dff'), S('gravity flipping', 'back', '#1d6b8a'), S('rewinding mistakes', 'refresh', '#3f8a2a'),
    S('cooking under pressure', 'idea', '#d07a2f'), S('possessing enemies', 'alien', '#8a2a2a'), S('drawing your own platforms', 'pencil', '#d0308f'), S('size shifting', 'search', '#2a6b6b'),
    S('one-button combat', 'play', '#c22a48'), S('trading with ghosts', 'dna', '#5a4a2a'), S('building with physics blocks', 'wrench', '#6b4a28'), S('echolocation', 'sound', '#3a3a5a'),
    S('cloning yourself', 'user', '#4a8a2a'), S('magnet powers', 'bolt', '#d0a02f'), S('dialogue duels', 'chat', '#2f8ad0'), S('elemental crafting', 'sparkle', '#d02f5a'),
    S('tetris-like inventory', 'tasks', '#2a6b6b'), S('swapping bodies with your pet', 'alien', '#a8650a', true), S('programming your sidekick', 'code', '#8a2fd0', true), S('editing the level code live', 'terminal', '#2a2a2a', true),
  ] },
  { id: 'setting', title: 'Setting', symbols: [
    S('a rainy back-alley lab', 'terminal', '#2a6b6b'), S('a sentient laundromat', 'refresh', '#2f7fd0'), S('the inside of a whale', 'eye', '#1d6b8a'), S('a floating sky bazaar', 'ufo', '#d07a2f'),
    S('a haunted shopping mall', 'shop', '#5a4a2a'), S('a tiny moon colony', 'star', '#3a3a5a'), S('a neon cyber-bayou', 'bolt', '#3f8a2a'), S('a dragon\'s tax office', 'folder', '#8a2a2a'),
    S('a sunken train network', 'play', '#2a6b6b'), S('a candy volcano', 'warn', '#d0308f'), S('a library that rearranges itself', 'tasks', '#6b4a28'), S('a post-apocalyptic mini golf course', 'pin', '#4a8a2a'),
    S('a kaiju daycare', 'alien', '#d05a2f'), S('an abandoned theme park', 'star', '#c22a48'), S('a pocket dimension in a backpack', 'folder', '#7a4dff'), S('a giant\'s kitchen', 'idea', '#d0a02f'),
    S('the last arcade on Earth', 'arcade', '#d02f5a'), S('a dream shared by two cats', 'eye', '#a8650a', true), S('the internet in 1999', 'terminal', '#8a2fd0', true), S('inside a broken video game', 'code', '#2a2a2a', true),
  ] },
  { id: 'twist', title: 'Twist', symbols: [
    S('you play as the final boss', 'warn', '#c22a48'), S('every death changes the map', 'refresh', '#3a3a5a'), S('the narrator lies', 'chat', '#5a4a2a'), S('enemies are your past runs', 'user', '#7a4dff'),
    S('you can\'t jump', 'stop', '#8a2a2a'), S('the music is the level', 'sound', '#d0308f'), S('time only moves when you move', 'play', '#2f7fd0'), S('you share one body with a rival', 'alien', '#d05a2f'),
    S('gravity is decided by vote', 'tasks', '#2a6b6b'), S('your weapon is a houseplant', 'idea', '#3f8a2a'), S('the UI is part of the world', 'widget', '#1d6b8a'), S('it\'s secretly a dating sim', 'star', '#d02f5a'),
    S('you have 10 seconds per level', 'bolt', '#d0a02f'), S('colours are a limited resource', 'sparkle', '#6b4a28'), S('NPCs remember everything', 'brain', '#4a8a2a'), S('the camera is a character', 'eye', '#2f8ad0'),
    S('co-op with your future self', 'user', '#d07a2f'), S('the game deletes itself as you win', 'trash', '#a8650a', true), S('aliens are watching and rating you', 'ufo', '#8a2fd0', true), S('you are the save file', 'file', '#2a2a2a', true),
  ] },
  { id: 'art', title: 'Art style', symbols: [
    S('Pixel-art', 'alien', '#3f8a2a'), S('Low-poly', 'star', '#2f7fd0'), S('Voxel', 'folder', '#7a4dff'), S('Hand-drawn', 'pencil', '#d07a2f'),
    S('Claymation', 'idea', '#c22a48'), S('Paper cut-out', 'file', '#6b4a28'), S('Neon synthwave', 'bolt', '#d0308f'), S('Watercolour', 'sparkle', '#2f8ad0'),
    S('1-bit', 'stop', '#2a2a2a'), S('Cel-shaded', 'eye', '#2a6b6b'), S('Felt and yarn', 'wardrobe', '#d05a2f'), S('PS1-era', 'arcade', '#5a4a2a'),
    S('Isometric diorama', 'wrench', '#1d6b8a'), S('Ink-wash', 'pencil', '#3a3a5a'), S('Toy-box plastic', 'star', '#d0a02f'), S('Comic-book', 'chat', '#d02f5a'),
    S('Blueprint', 'tasks', '#2f7fd0'), S('Jelly-squish', 'alien', '#4a8a2a', true), S('Live-action FMV', 'play', '#a8650a', true), S('ASCII terminal', 'terminal', '#8a2fd0', true),
  ] },
];

export function ideaSentence(s: Sym[]) {
  const [genre, mech, setting, twist, art] = s;
  const low = (t: string) => (/[A-Z].*[A-Z]/.test(t) ? t : t.toLowerCase());
  const a = /^[aeiou]/i.test(art.label) ? 'An' : 'A';
  return `${a} ${low(art.label)} ${low(genre.label)} built around ${mech.label}, set in ${setting.label} — twist: ${twist.label}.`;
}
