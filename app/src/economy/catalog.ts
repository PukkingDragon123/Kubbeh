// The GENE-O-MAT catalog. Shared contract between the shop (src/ui/shop), the wardrobe,
// and the 3D world (src/world/models implements a voxel model for every `placeable` id,
// and src/world/alien implements every hat/outfit/accessory/skin key).
import type { CatalogItem, Expression } from '../core/types';

const P = (id: string, name: string, category: CatalogItem['category'], price: number, blurb: string, rarity: CatalogItem['rarity'] = 'common'): CatalogItem =>
  ({ id, name, category, price, blurb, rarity, model: id, placeable: true });
const C = (id: string, name: string, category: CatalogItem['category'], price: number, blurb: string, rarity: CatalogItem['rarity'] = 'common'): CatalogItem =>
  ({ id, name, category, price, blurb, rarity, model: id });

export const CATALOG: CatalogItem[] = [
  // ── furniture ──
  P('beanbag', 'Slime Beanbag', 'furniture', 40, 'Squishes back. Aliens nap here between builds.'),
  P('couch', 'Sagging Alley Couch', 'furniture', 80, 'Found behind the dumpster. Smells like victory.'),
  P('workbench', 'Spare Workbench', 'furniture', 60, 'Another desk for another clone.'),
  P('shelf', 'Specimen Shelf', 'furniture', 55, 'Jars, bolts, one suspicious sock.'),
  P('rug', 'Crop-Circle Rug', 'furniture', 30, 'Hand-woven by a very patient farmer.'),
  P('stool', 'Bolt Stool', 'furniture', 15, 'Three legs, zero ergonomics.'),
  // ── decor ──
  P('neon_heart', 'Neon "♥ GLOB" Sign', 'decor', 70, 'Pink buzzing tube love.', 'rare'),
  P('neon_ufo', 'UFO Neon Sign', 'decor', 90, 'Flickers like it is about to abduct someone.', 'rare'),
  P('poster', 'WANTED: Area 51 Poster', 'decor', 20, 'Reward: one (1) cheeseburger.'),
  P('graffiti', 'Alien Spray Tag', 'decor', 25, 'The crew signed the wall.'),
  P('lava_lamp', 'Slime Lava Lamp', 'decor', 45, 'Blobs rise. Blobs fall. Blobs are friends.'),
  P('disco', 'Mirror Disco Ball', 'decor', 150, 'Turns every deploy into a party.', 'epic'),
  P('traffic_cone', 'Stolen Traffic Cone', 'decor', 10, 'Every alley lab has one.'),
  P('trash_can', 'Overflowing Bin', 'decor', 12, 'Mostly failed prototypes.'),
  P('gnome', 'Probed Garden Gnome', 'decor', 66, 'He has seen things.', 'rare'),
  // ── plants ──
  P('chomper', 'Chomp Plant', 'plant', 50, 'Has a mouth. Snaps at the cursor. Loves bugs (the code kind).'),
  P('eyeplant', 'Eyeball Sprout', 'plant', 60, 'Watches you code. Blinks supportively.', 'rare'),
  P('cactus', 'Static Cactus', 'plant', 35, 'Zaps anyone who touches the keyboard.'),
  P('tentacle_fern', 'Tentacle Fern', 'plant', 75, 'Waves hello. Waves goodbye. Just waves.', 'rare'),
  P('shroom', 'Glow Shroom Cluster', 'plant', 40, 'Free night light, mild hallucinations.'),
  // ── equipment ──
  P('tesla', 'Tesla Coil', 'equipment', 120, 'Crackles whenever Claude thinks hard.', 'rare'),
  P('microscope', 'Gooscope', 'equipment', 70, 'For inspecting very small bugs.'),
  P('jars', 'Specimen Jars', 'equipment', 50, 'Pickled prototypes of games past.'),
  P('brain_tank', 'Brain in a Jar', 'equipment', 140, 'Hums ideas at 3am.', 'epic'),
  P('teleporter', 'Teleport Pad', 'equipment', 220, 'Clones arrive in style.', 'epic'),
  P('server_rack', 'Blinky Server Rack', 'equipment', 110, 'All lights, no servers.', 'rare'),
  P('generator', 'Hamster-Wheel Generator', 'equipment', 95, 'A very tired space hamster powers the lab.'),
  // ── arcade ──
  P('slot_machine', 'Idea Slot Machine', 'arcade', 100, 'Pull the lever, get a random game idea. Unlocks the Slots station.', 'rare'),
  P('arcade_cab', 'Arcade Cabinet', 'arcade', 160, 'Playable! Unlocks the Arcade station.', 'epic'),
  P('pinball', 'Alien Pinball', 'arcade', 180, 'Tilt detection: none.', 'epic'),
  P('jukebox', 'Space Jukebox', 'arcade', 130, 'Plays only bangers from Zeta Reticuli.', 'rare'),
  P('claw', 'Claw Machine', 'arcade', 150, 'The claw is our master.', 'rare'),
  // ── lighting ──
  P('string_lights', 'Fairy String Lights', 'lighting', 35, 'Cozy mode: on.'),
  P('lamp_floor', 'Industrial Floor Lamp', 'lighting', 40, 'Warm cone of productivity.'),
  P('neon_tube', 'Neon Tube Bar', 'lighting', 25, 'Pick a colour, any colour.'),

  // ── hats ──
  C('goggles', 'Lab Goggles', 'hat', 0, 'Standard issue. Mostly decorative.'),
  C('hardhat', 'Hard Hat', 'hat', 0, 'Safety third.'),
  C('tophat', 'Tiny Top Hat', 'hat', 40, 'Fancy experiments only.'),
  C('propeller', 'Propeller Cap', 'hat', 35, 'Spins faster when coding.'),
  C('beanie', 'Slouchy Beanie', 'hat', 25, 'Alley chic.'),
  C('chef', 'Chef Hat', 'hat', 30, 'For cooking up builds.'),
  C('wizard', 'Wizard Hat', 'hat', 80, 'Any sufficiently advanced code…', 'rare'),
  C('party', 'Party Cone', 'hat', 15, 'Every shipped build is a birthday.'),
  C('cowboy', 'Space Cowboy Hat', 'hat', 45, 'Yee-haw, earthling.'),
  C('halo', 'Glitchy Halo', 'hat', 120, 'Only for aliens who never break prod.', 'epic'),
  C('crown', 'Jelly Crown', 'hat', 200, 'Ruler of the alley.', 'legendary'),
  // ── outfits ──
  C('labcoat', 'Lab Coat', 'outfit', 0, 'Stained with mystery goo.'),
  C('hoodie', 'Hacker Hoodie', 'outfit', 40, 'Hood up = deep focus.'),
  C('overalls', 'Grease Overalls', 'outfit', 35, 'For machine whacking.'),
  C('hazmat', 'Hazmat Suit', 'outfit', 60, 'For legacy code.'),
  C('cape', 'Hero Cape', 'outfit', 70, 'Swooshes on every jump.', 'rare'),
  C('tuxedo', 'Tiny Tuxedo', 'outfit', 90, 'Black tie, green skin.', 'rare'),
  C('spacesuit', 'Retro Spacesuit', 'outfit', 150, 'Ready for the commute home.', 'epic'),
  // ── accessories ──
  C('headphones', 'Big Headphones', 'accessory', 0, 'Lo-fi beats to probe to.'),
  C('bowtie', 'Bowtie', 'accessory', 0, 'Bowties are cool.'),
  C('scarf', 'Striped Scarf', 'accessory', 20, 'The alley gets drafty.'),
  C('glasses', 'Nerd Glasses', 'accessory', 25, '+5 debugging.'),
  C('mustache', 'Fancy Mustache', 'accessory', 15, 'Distinguished.'),
  C('backpack', 'Tiny Backpack', 'accessory', 40, 'Carries one (1) file at a time.'),
  C('monocle', 'Monocle', 'accessory', 55, 'Indeed.', 'rare'),
  C('jetpack', 'Jetpack', 'accessory', 180, 'Hops become flights.', 'epic'),
  // ── skins ──
  C('glob', 'Classic Glob', 'skin', 0, 'The original lime jelly.'),
  C('pounce', 'Snow Pounce', 'skin', 0, 'Snow leopard kitten. Big eyes. Raised paw. Pure menace.', 'legendary'),
  C('pickle', 'Pickle', 'skin', 60, 'Bumpy, briny, beloved.'),
  C('bubblegum', 'Bubblegum', 'skin', 80, 'Pink jelly, pops when poked.', 'rare'),
  C('ghost', 'Ghost Jelly', 'skin', 120, 'See-through cyan. Spooky debugger.', 'rare'),
  C('magma', 'Magma', 'skin', 150, 'Glows orange. Do not hug.', 'epic'),
  C('void', 'Void Walker', 'skin', 200, 'Deep purple with tiny stars inside.', 'epic'),
  C('gold', 'Solid Gold', 'skin', 500, 'For legendary shippers only.', 'legendary'),
  // ── expressions ──
  C('expr_love', 'Heart Eyes', 'expression', 0, 'Smitten with your code.'),
  C('expr_tongue', 'Blep', 'expression', 15, 'Tongue out. No thoughts.'),
  C('expr_cry', 'Big Tears', 'expression', 10, 'When the build fails.'),
  C('expr_grumpy', 'Grumpy', 'expression', 10, 'Has opinions about tabs vs spaces.'),
];

export const catalogById = new Map(CATALOG.map((i) => [i.id, i]));

export const HATS = CATALOG.filter((i) => i.category === 'hat').map((i) => i.id);
export const OUTFITS = CATALOG.filter((i) => i.category === 'outfit').map((i) => i.id);
export const ACCESSORIES = CATALOG.filter((i) => i.category === 'accessory').map((i) => i.id);
export const SKINS = CATALOG.filter((i) => i.category === 'skin').map((i) => i.id);
export const PLACEABLES = CATALOG.filter((i) => i.placeable).map((i) => i.id);

/** Expressions everyone has; the rest are bought as `expr_<name>`. */
export const FREE_EXPRESSIONS: Expression[] = ['happy', 'derp', 'sleepy', 'wink', 'focused', 'shocked', 'love'];
export const ALL_EXPRESSIONS: Expression[] = ['happy', 'derp', 'sleepy', 'wink', 'focused', 'shocked', 'love', 'tongue', 'cry', 'grumpy'];

/** Price 0 items are owned from the start. */
export const isStarter = (id: string) => (catalogById.get(id)?.price ?? 1) === 0;
export const ownsItem = (owned: Record<string, number>, id: string) => isStarter(id) || (owned[id] ?? 0) > 0;
export const ownsExpression = (owned: Record<string, number>, e: Expression) => FREE_EXPRESSIONS.includes(e) || (owned[`expr_${e}`] ?? 0) > 0;
