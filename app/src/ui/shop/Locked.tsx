import { economy } from '../../core/state';
import { catalogById } from '../../economy/catalog';
import { buyItem } from '../../economy/genes';
import { itemThumb } from '../../economy/pixelart';
import { Btn } from '../common/kit';

/** A station you have to buy first (slot machine, arcade cabinet). */
export function LockedStation({ itemId, pitch }: { itemId: string; pitch: string }) {
  const item = catalogById.get(itemId)!;
  const bal = economy.value.balance;
  const afford = bal >= item.price;
  return (
    <div class="locked-station">
      <img class="pixelated" src={itemThumb(itemId)} alt="" />
      <h3 style={{ fontSize: '22px' }}>{item.name}</h3>
      <p class="dim" style={{ margin: 0, maxWidth: '40ch' }}>{pitch}</p>
      <Btn tone={afford ? 'pink' : 'ghost'} size="lg" icon="dna" silent onClick={() => buyItem(itemId)}>
        {afford ? `Buy for ${item.price} genes` : `${item.price - bal} more genes needed`}
      </Btn>
      <span class="dimmer" style={{ fontSize: '12px' }}>You have {bal} genes. Finish experiments in the Terminal to earn more.</span>
    </div>
  );
}
