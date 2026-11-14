// Shop stations: GENE-O-MAT, Wardrobe, Slots, Arcade, Badges.
import './shop.css';
import { registerPanel } from '../panels';
import { Shop } from './Shop';
import { Wardrobe } from './Wardrobe';
import { SlotPanel } from './Slot';
import { ArcadePanel } from './Arcade';
import { AchievementsPanel } from './Achievements';

registerPanel({ id: 'shop', title: 'GENE-O-MAT', icon: 'shop', size: 'lg', component: Shop, dock: { label: 'Shop', order: 3, hotkey: 's' } });
registerPanel({ id: 'wardrobe', title: 'Wardrobe', icon: 'wardrobe', size: 'lg', component: Wardrobe, dock: { label: 'Wardrobe', order: 4, hotkey: 'w' } });
registerPanel({ id: 'slot', title: 'Idea Slot Machine', icon: 'slot', size: 'md', component: SlotPanel, dock: { label: 'Slots', order: 5, hotkey: 'l' } });
registerPanel({ id: 'arcade', title: 'Arcade', icon: 'arcade', size: 'md', component: ArcadePanel, dock: { label: 'Arcade', order: 7, hotkey: 'a' } });
registerPanel({ id: 'achievements', title: 'Badges', icon: 'trophy', size: 'md', component: AchievementsPanel });
