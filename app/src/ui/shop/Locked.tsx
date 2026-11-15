import { economy } from '../../core/state';
import { catalogById } from '../../economy/catalog';
import { buyItem } from '../../economy/genes';
import { VoxView } from './vox/VoxView';
import { itemOnPedestal } from './vox/models';
import { Btn } from '../common/kit';

/** A station you have to buy first (slot machine, arcade cabinet). */
export function LockedStation({ itemId, pitch }: { itemId: string; pitch: string }) {
  const item = catalogById.get(itemId)!;
  const bal = economy.value.balance;
  const afford = bal >= item.price;
  return (
    <div class="locked-station">
      <VoxView class="locked-art" size={200} spin="always" eager cacheKey={`locked:${itemId}`} make={() => itemOnPedestal(itemId)} alt={item.name} />
      <h3 style={{ fontSize: '26px' }}>{item.name}</h3>
      <p class="dim" style={{ margin: 0, maxWidth: '40ch' }}>{pitch}</p>
      <Btn tone={afford ? 'pink' : 'ghost'} size="lg" icon="dna" silent onClick={() => buyItem(itemId)}>
        {afford ? `Buy for ${item.price} genes` : `${item.price - bal} more genes needed`}
      </Btn>
      <span class="dimmer" style={{ fontSize: '13px' }}>You have {bal} genes. Finish experiments in the Terminal to earn more.</span>
    </div>
  );
}
