// Prof. Glorp's Idea Lab.
import './idea.css';
import { registerPanel } from '../panels';
import { IdeaLab } from './IdeaLab';

registerPanel({ id: 'idea', title: 'Idea Lab', icon: 'idea', size: 'xl', component: IdeaLab, dock: { label: 'Ideas', order: 2, hotkey: 'i' } });
