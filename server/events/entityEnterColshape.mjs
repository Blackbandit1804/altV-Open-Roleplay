import * as alt from 'alt';
import * as systemsInteraction from '../systems/interaction.mjs';

alt.on('entityEnterColshape', (colshape, entity) => {
    // Forward any interaction events to the player.
    if (entity.constructor.name === 'Player') {
        if (colshape.sector) {
            entity.sector = colshape.sector;
        }

        systemsInteraction.forwardEventToPlayer(colshape, entity);
    }
});
