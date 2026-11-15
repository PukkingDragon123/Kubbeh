// CONTRACT STUB — replaced by the cosmetics worker. Keep these exports & signatures.
import * as THREE from 'three';
import type { AlienLook } from '../core/types';
import type { AlienParts } from './alien';

export type HandItem = 'hammer' | 'wrench' | 'magnifier' | 'box' | 'mug' | 'chalk' | 'clipboard' | 'tablet' | null;

/** Attach the look's hat / outfit / accessory voxel models to the alien's anchors. Idempotent. */
export function dressAlien(_parts: AlienParts, _look: AlienLook): void {}

/** A standalone voxel model of a cosmetic (for shop thumbnails / wardrobe racks). */
export function buildCosmetic(_id: string): THREE.Object3D { return new THREE.Group(); }

/** A voxel model of a held tool, origin at the grip. */
export function buildHeldItem(_id: Exclude<HandItem, null>): THREE.Object3D { return new THREE.Group(); }
