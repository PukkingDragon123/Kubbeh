// GENE-O-MAT — the lab's vending machine. Spend Gene Points on furniture, plants,
// weird equipment, arcade machines and alien cosmetics.
import { useMemo, useState } from 'preact/hooks';
import { economy, editMode, placingItem, setPanel, unplacedCount } from '../../core/state';
import { sfx } from '../../core/bus';
import { fmtAgo } from '../../core/util';
import type { CatalogItem, ItemCategory } from '../../core/types';
import { Btn, Tabs, Win, Empty } from '../common/kit';
import { Icon, type IconName } from '../common/icons';
import { CATALOG, catalogById, isStarter, ownsItem } from '../../economy/catalog';
import { buyItem } from '../../economy/genes';
import { VoxView } from './vox/VoxView';
import { pixelBurst } from './vox/pixel';
import { itemOnPedestal, stationArt, RARITY_COLOR } from './vox/models';

type Tab = 'hq' | 'arcade' | 'wear' | 'skins' | 'ledger';

const TABS: { id: Tab; label: string; icon: IconName; cats: ItemCategory[] }[] = [
  { id: 'hq', label: 'HQ Stuff', icon: 'wrench', cats: ['furniture', 'decor', 'plant', 'equipment', 'lighting'] },
  { id: 'arcade', label: 'Arcade', icon: 'arcade', cats: ['arcade'] },
  { id: 'wear', label: 'Wearables', icon: 'wardrobe', cats: ['hat', 'outfit', 'accessory'] },
  { id: 'skins', label: 'Skins & Faces', icon: 'alien', cats: ['skin', 'expression'] },
  { id: 'ledger', label: 'Ledger', icon: 'dna', cats: [] },
];

const CAT_LABEL: Record<ItemCategory, string> = {
  furniture: 'Furniture', decor: 'Decor', plant: 'Alien plants', equipment: 'Lab equipment', arcade: 'Arcade', lighting: 'Lighting',
  hat: 'Hats', outfit: 'Outfits', accessory: 'Accessories', skin: 'Skins', expression: 'Expressions', wall: 'Walls',
};

export function Shop({ close }: { arg: unknown; close: () => void }) {
  const [tab, setTab] = useState<Tab>('hq');
  const [sel, setSel] = useState<string | null>(null);
  const [cat, setCat] = useState<ItemCategory | 'all'>('all');
  const [dropping, setDropping] = useState<string | null>(null);
  const [wiggle, setWiggle] = useState(0);
  const eco = economy.value;
  const tabDef = TABS.find((t) => t.id === tab)!;
  const items = useMemo(
    () => CATALOG.filter((i) => tabDef.cats.includes(i.category) && (cat === 'all' || i.category === cat)).sort((a, b) => a.price - b.price),
    [tab, cat],
  );
  const item = sel ? catalogById.get(sel) ?? null : null;

  const buy = (it: CatalogItem) => {
    const r = buyItem(it.id);
    if (r.ok) {
      setDropping(it.id); setTimeout(() => setDropping(null), 750);
      const el = document.querySelector('.vend-detail .big') ?? document.querySelector(`.vend-slot[aria-pressed="true"]`);
      if (el) pixelBurst(el as HTMLElement, 'buy');
    }
    else if (r.reason === 'funds') setWiggle((w) => w + 1);
  };
  const place = (it: CatalogItem) => {
    sfx('select', 0.5);
    placingItem.value = it.id;
    editMode.value = true;
    setPanel(null);
  };

  return (
    <Win title="GENE-O-MAT" icon="shop" onClose={close} actions={<StationBar />}>
      <Tabs value={tab} tabs={TABS.map((t) => ({ id: t.id, label: t.label, icon: t.icon }))} onChange={(t) => { setTab(t); setCat('all'); setSel(null); }} />
      <div class="vend">
        <div class="vend-glass">
          {tab === 'ledger' ? <Ledger /> : (
            <>
              {tabDef.cats.length > 1 && (
                <div class="row wrap gap-4" style={{ padding: '2px 4px 8px', position: 'relative', zIndex: 3 }}>
                  <button type="button" class={`chip ${cat === 'all' ? 'g' : ''}`} onClick={() => { sfx('tab', .4); setCat('all'); }}>All</button>
                  {tabDef.cats.map((c) => <button type="button" key={c} class={`chip ${cat === c ? 'g' : ''}`} onClick={() => { sfx('tab', .4); setCat(c); }}>{CAT_LABEL[c]}</button>)}
                </div>
              )}
              <div class="vend-grid">
                {items.map((it) => {
                  const owned = eco.owned[it.id] ?? 0;
                  const has = ownsItem(eco.owned, it.id);
                  return (
                    <button type="button" key={it.id} class={`vend-slot r-${it.rarity} ${dropping === it.id ? 'dropping' : ''}`} aria-pressed={sel === it.id}
                      style={{ ['--rar' as any]: '#' + RARITY_COLOR[it.rarity].toString(16).padStart(6, '0') }}
                      onMouseEnter={() => sfx('hover', .1)} onClick={() => { sfx('blip', .35, 1 + Math.random() * .2); setSel(it.id); }} aria-label={it.name}>
                      {it.placeable && owned > 0 && <span class="owned tnum">×{owned}</span>}
                      {!it.placeable && has && <span class="owned"><Icon name="check" size="sm" /></span>}
                      <VoxView class="thumb" size={112} spin="hover" cacheKey={`shop:${it.id}`} make={() => itemOnPedestal(it.id)} title={it.name} />
                      <span class="nm-hover">{it.name}</span>
                      <span class="plaque">{isStarter(it.id) ? <b>FREE</b> : <><Icon name="dna" size="sm" /><b class="tnum">{it.price}</b></>}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <aside class="vend-side">
          <div class="vend-coin" key={wiggle} >
            <span class="up dim">Gene Points</span>
            <span class={`vend-balance tnum ${wiggle ? 'wiggle' : ''}`}><Icon name="dna" size="lg" />{eco.balance.toLocaleString()}</span>
            <span class="dimmer" style={{ fontSize: '12px' }}>Earn genes by finishing experiments, writing files, making artifacts and badges.</span>
          </div>
          <div class="vend-detail">
            {item ? <Detail item={item} onBuy={buy} onPlace={place} /> : (
              <Empty icon="shop" title="Pick a slot">
                <span style={{ fontSize: '13px' }}>Tap any item behind the glass to inspect it. Furniture goes straight into your HQ; wearables go on your aliens in the Wardrobe.</span>
              </Empty>
            )}
          </div>
        </aside>
      </div>
    </Win>
  );
}

function Detail({ item, onBuy, onPlace }: { item: CatalogItem; onBuy: (i: CatalogItem) => void; onPlace: (i: CatalogItem) => void }) {
  const eco = economy.value;
  const owned = eco.owned[item.id] ?? 0;
  const has = ownsItem(eco.owned, item.id);
  const unplaced = item.placeable ? unplacedCount(item.id) : 0;
  const afford = eco.balance >= item.price;
  const wearable = ['hat', 'outfit', 'accessory', 'skin', 'expression'].includes(item.category);
  return (
    <>
      <VoxView key={item.id} class="big" size={180} spin="always" eager cacheKey={`shop-big:${item.id}`} make={() => itemOnPedestal(item.id)} alt={item.name} />
      <div class="col gap-4" style={{ textAlign: 'center' }}>
        <span class={`rarity ${item.rarity}`}><i class="rar-gem" />{CAT_LABEL[item.category]}</span>
        <h3 style={{ fontSize: '19px' }}>{item.name}</h3>
        <p class="dim" style={{ margin: 0, fontSize: '13px' }}>{item.blurb}</p>
      </div>
      {item.placeable && <div class="row" style={{ justifyContent: 'center', gap: '6px' }}><span class="chip">Owned {owned}</span><span class="chip c">In storage {unplaced}</span></div>}
      <div class="col gap-8" style={{ marginTop: 'auto' }}>
        {(item.placeable || !has) && (
          <Btn tone={afford ? 'pink' : 'ghost'} size="lg" block icon="dna" silent onClick={() => onBuy(item)} disabled={!item.placeable && has}>
            {afford ? `Buy for ${item.price}` : `Need ${item.price - eco.balance} more`}
          </Btn>
        )}
        {item.placeable && unplaced > 0 && <Btn tone="cyan" block icon="wrench" onClick={() => onPlace(item)}>Place in HQ</Btn>}
        {item.id === 'slot_machine' && owned > 0 && <Btn tone="amber" block icon="slot" onClick={() => setPanel('slot')}>Open Slots</Btn>}
        {item.id === 'arcade_cab' && owned > 0 && <Btn tone="amber" block icon="arcade" onClick={() => setPanel('arcade')}>Play Arcade</Btn>}
        {wearable && has && <Btn tone="glob" block icon="wardrobe" onClick={() => setPanel('wardrobe')}>Wear it in the Wardrobe</Btn>}
      </div>
    </>
  );
}

function Ledger() {
  const eco = economy.value;
  const rows = [...eco.ledger].reverse();
  return (
    <div class="col" style={{ minHeight: 0, overflow: 'auto', padding: '4px', position: 'relative', zIndex: 3 }}>
      <div class="row gap-16 wrap" style={{ padding: '4px 8px 10px' }}>
        <span class="chip g">Lifetime earned {eco.lifetime.toLocaleString()}</span>
        <span class="chip p">Spent {(eco.stats.spent ?? 0).toLocaleString()}</span>
        <span class="chip a">Streak {eco.streak ?? 0} day{eco.streak === 1 ? '' : 's'}</span>
      </div>
      {rows.length === 0 && <Empty icon="dna" title="No transactions yet" />}
      {rows.map((r, i) => (
        <div class="ledger-row" key={i}>
          <span class="ellipsis">{r.reason}</span>
          <span class="dimmer">{fmtAgo(r.ts)}</span>
          <span class={`amt tnum px ${r.amount >= 0 ? 'pos' : 'neg'}`}>{r.amount >= 0 ? '+' : ''}{r.amount}</span>
        </div>
      ))}
    </div>
  );
}

/** The dock is gone: the vending machine carries little 3D shortcuts to its sister stations. */
function StationBar() {
  const go = (fn: () => void) => () => { sfx('select', .45); fn(); };
  const items: { k: 'wardrobe' | 'edit' | 'badges' | 'slots' | 'arcade'; label: string; on: () => void }[] = [
    { k: 'wardrobe', label: 'Wardrobe', on: () => setPanel('wardrobe') },
    { k: 'edit', label: 'Edit HQ — place & move furniture', on: () => { editMode.value = true; setPanel(null); } },
    { k: 'slots', label: 'Idea Slot Machine', on: () => setPanel('slot') },
    { k: 'arcade', label: 'Arcade', on: () => setPanel('arcade') },
    { k: 'badges', label: 'Badges', on: () => setPanel('achievements') },
  ];
  return (
    <div class="station-bar">
      {items.map((s) => (
        <button type="button" key={s.k} class="station-btn" onClick={go(s.on)} onMouseEnter={() => sfx('hover', .12)} aria-label={s.label} data-tip={s.label}>
          <VoxView size={40} spin="hover" cacheKey={`station:${s.k}`} make={() => stationArt(s.k)} fill={0.96} />
        </button>
      ))}
    </div>
  );
}
