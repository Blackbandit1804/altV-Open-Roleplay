import * as alt from 'alt';
import * as configurationItems from '../configuration/items.mjs';
import * as utilityVector from '../utility/vector.mjs';
import * as utilityEncryption from '../utility/encryption.mjs';
import { generateHash } from '../utility/encryption.mjs';
import { BaseItems, Items } from '../configuration/items.mjs';
import { Weapons } from '../configuration/weapons.mjs';
console.log('Loaded: systems->inventory.mjs');

// hash, itemdata
let ItemDrops = new Map();

// Called when a player consumes an item.
alt.on('item:Consume', (player, itemObject) => {
    Object.keys(configurationItems.Items).forEach(key => {
        if (configurationItems.Items[key].label !== itemObject.label) return;

        const itemTemplate = configurationItems.Items[key];

        if (itemTemplate.sound !== undefined) {
            player.playAudio(itemTemplate.sound);
        }

        // animdict: 'mp_player_inteat@burger',
        // anim: 'mp_player_int_eat_burger_fp',
        // animflag: 49,
        // Play animation for player if available.
        if (itemTemplate.anim !== undefined) {
            player.playAnimation(
                itemTemplate.anim.dict,
                itemTemplate.anim.name,
                itemTemplate.anim.duration,
                itemTemplate.anim.flag
            );
        }

        alt.emit(itemTemplate.eventcall, player, itemObject.props, itemTemplate.message);
        return;
    });
});

// Called when a player uses an item.
alt.on('item:Use', (player, itemObject) => {
    Object.keys(configurationItems.Items).forEach(key => {
        if (configurationItems.Items[key].label !== itemObject.label) return;

        const itemTemplate = configurationItems.Items[key];

        if (itemTemplate.sound !== undefined) {
            player.playAudio(itemTemplate.sound);
        }

        if (itemTemplate.eventcall === undefined) return;

        alt.emit(itemTemplate.eventcall, player, itemObject.props, itemTemplate.message);
        return;
    });
});

// Remove an item from a player.
alt.on('inventory:SubItem', (player, index, quantity) => {
    player.inventory[index].quantity -= quantity;

    if (player.inventory[index].quantity <= 0) {
        player.inventory[index] = null;
        player.data.inventory = JSON.stringify(player.inventory);
        player.saveField(player.data.id, 'inventory', player.data.inventory);
        player.updateInventory();
        return;
    }

    player.data.inventory = JSON.stringify(player.inventory);
    player.saveField(player.data.id, 'inventory', player.data.inventory);
    player.updateInventory();
});

alt.on('inventory:AddItem', (player, index, quantity) => {
    player.inventory[index].quantity += quantity;
    player.data.inventory = JSON.stringify(player.inventory);
    player.saveField(player.data.id, 'inventory', player.data.inventory);
    player.setSyncedMeta('inventory', player.data.inventory);
    player.updateInventory();
});

export function rename(player, hash, newName) {
    let index = player.inventory.findIndex(
        x => x !== null && x !== undefined && x.hash === hash
    );

    if (index <= -1) {
        player.updateInventory();
        return;
    }

    if (!player.inventory[index].rename) {
        player.updateInventory();
        player.send(`You can't rename that item.`);
        return;
    }

    if (newName.length >= 20) {
        player.updateInventory();
        player.send(`New name is too long.`);
        return;
    }

    if (newName.match(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/)) {
        player.updateInventory();
        player.send(`New name cannot contain symbols.`);
        return;
    }

    newName = newName.replace(' ', '_');

    player.inventory[index].label = newName;
    player.data.inventory = JSON.stringify(player.inventory);
    player.setSyncedMeta('inventory', player.data.inventory);
    player.saveField(player.data.id, 'inventory', player.data.inventory);
}

export function use(player, hash) {
    const item = player.inventory.find(item => {
        if (item && item.hash === hash) return item;
    });

    if (!item) {
        player.syncInventory();
        return;
    }

    const baseItem = BaseItems[item.base];

    if (!baseItem) {
        console.log(`${baseItem} is not defined for use.`);
        return;
    }

    if (Array.isArray(baseItem.eventcall)) {
        baseItem.eventcall.forEach(event => {
            alt.emit(event, player, item, hash);
        });
    } else {
        alt.emit(baseItem.eventcall, player, item, hash);
    }
}

export function unequipItem(player, hash) {
    const index = player.equipment.findIndex(item => {
        if (item && item.hash === hash) return item;
    });

    if (index <= -1) {
        player.syncInventory();
        return;
    }

    player.unequipItem(index);
}

export function splitItem(player, hash) {
    const index = player.inventory.findIndex(item => {
        if (item && item.hash === hash) return item;
    });

    if (index <= -1) {
        player.syncInventory();
        return;
    }

    player.splitItem(index);
}

export function dropNewItem(player, item) {
    let isDroppable = true;
    Object.keys(configurationItems.Items).forEach(key => {
        if (configurationItems.Items[key].label !== item.label) return;
        isDroppable = configurationItems.Items[key].droppable;
    });

    if (!isDroppable) {
        console.log('Cannot be dropped.');
        console.log(item);
        return;
    }

    // Regenerate new hash for each dropped item.
    let firstHash = utilityEncryption.generateHash(JSON.stringify(item));
    let newHash = utilityEncryption.generateHash(JSON.stringify({ firstHash, item }));
    item.hash = newHash;

    // Setup the dropped item.
    ItemDrops.set(newHash, item);

    let randomPos = utilityVector.randPosAround(player.pos, 2);
    alt.emitClient(null, 'inventory:ItemDrop', player, item, randomPos);
}

export function drop(player, hash) {
    if (player.isDropping) {
        player.syncInventory();
        return;
    }

    player.isDropping = true;

    if (player.vehicle) {
        player.syncInventory();
        player.isDropping = false;
        return;
    }

    let index = player.inventory.findIndex(i => {
        if (i && i.hash === hash) return i;
    });

    if (index <= -1) {
        player.syncInventory();
        player.isDropping = false;
        return;
    }

    const baseItem = BaseItems[player.inventory[index].base];

    if (!baseItem) {
        player.syncInventory();
        player.isDropping = false;
        return;
    }

    if (!baseItem.abilities.drop) {
        player.send(`You cannot drop this item.`);
        player.syncInventory();
        player.isDropping = false;
        return;
    }

    // Generate a clone of the object.
    const clonedItem = { ...player.inventory[index] };
    player.removeItem(index);

    // Regenerate new hash for each dropped item.
    let newHash = generateHash(JSON.stringify({ hash, clonedItem }));
    clonedItem.hash = newHash;

    // Setup the dropped item.
    ItemDrops.set(newHash, clonedItem);
    const randomPos = utilityVector.randPosAround(player.pos, 2);
    alt.emitClient(null, 'inventory:ItemDrop', player, clonedItem, randomPos);
    player.isDropping = false;
}

export function destroy(player, hash) {
    const index = player.inventory.findIndex(item => {
        if (item && item.hash === hash) return item;
    });

    if (index <= -1) {
        player.syncInventory();
        return;
    }

    player.removeItem(index);
}

export function pickup(player, hash) {
    if (player.pickingUpItem) return;
    if (!ItemDrops.has(hash)) return;
    player.pickingUpItem = true;

    let item = { ...ItemDrops.get(hash) };
    ItemDrops.delete(hash);

    if (!player.addItem(item.key, item.quantity, item.props)) {
        ItemDrops.set(hash, item);
        player.pickingUpItem = false;
        return;
    }

    alt.emitClient(null, 'inventory:ItemPickup', hash);
    player.playAudio('pickup');
    player.playAnimation('random@mugging4', 'pickup_low', 1200, 33);
    player.pickingUpItem = false;
}

export function swapItem(player, heldIndex, dropIndex) {
    player.swapItems(heldIndex, dropIndex);
}

export function addWeapon(player, weaponName) {
    let weapon;
    Object.keys(Weapons).forEach(key => {
        if (key !== weaponName) return;
        weapon = {
            name: key,
            value: Weapons[key]
        };
    });

    if (!weapon) return false;

    const props = {
        hash: weapon.value
    };

    player.addItem('weapon', 1, props, false, false, weapon.name);
    return true;
}
