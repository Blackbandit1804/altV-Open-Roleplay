import * as alt from 'alt';
import SQL from '../../postgres-wrapper/database.mjs'; // Database
import { Account, Character, Vehicle, Details } from './entities/entities.mjs'; // Schemas for Database
import { cacheAccount, setVehicleID, cacheCharacter } from './cache/cache.mjs';
import fs from 'fs';
import path from 'path';

const resourceDir = alt.getResourcePath('orp');
const dbData = fs
    .readFileSync(path.join(resourceDir, '/server/configuration/database.json'))
    .toString();
let dbInfo;

try {
    dbInfo = JSON.parse(dbData);
} catch (err) {
    console.log('FAILED TO PROCESS DATABASE INFO. RUN INSTALLATION PROCESS AGAIN.');
    console.log(err);
    process.exit(0);
}

// Setup Main Entities and Database Connection
let db = new SQL(
    dbInfo.type,
    dbInfo.address,
    dbInfo.port,
    dbInfo.username,
    dbInfo.password,
    dbInfo.dbname,
    // Specify New Table Schemas Here
    [Account, Character, Vehicle, Details]
);

alt.on('ConnectionComplete', () => {
    let filesLoaded = 0;
    const folders = fs.readdirSync(path.join(alt.rootDir, '/resources/orp/server/'));
    const filterFolders = folders.filter(x => !x.includes('.mjs'));
    for (let i = 0; i < filterFolders.length; i++) {
        const folder = filterFolders[i];
        const files = fs.readdirSync(
            path.join(alt.rootDir, `/resources/orp/server/${folder}`)
        );
        const filterFiles = files.filter(x => x.includes('.mjs'));

        for (let f = 0; f < filterFiles.length; f++) {
            const newPath = `./${folder}/${filterFiles[f]}`;
            /* jshint ignore:start */
            import(newPath)
                .then(res => {
                    if (!res) {
                        alt.log(`Failed to load: ${newPath}`);
                    } else {
                        filesLoaded += 1;
                        alt.log(`[${filesLoaded}] Loaded: ${newPath}`);
                    }
                })
                .catch(err => {
                    console.log('\r\n\x1b[31mERROR IN LOADED FILE');
                    alt.log(newPath);
                    alt.log(err);
                    console.log('\r\n \x1b[0m');
                    return undefined;
                });
            /* jshint ignore:end */
        }
    }

    cacheInformation();
    setTimeout(() => {
        alt.log('\r\nORP Ready - Loading Any Addons\r\n');
        alt.emit('orp:Ready');
    }, 5000);
});

// Used to speed up the server dramatically.
function cacheInformation() {
    db.fetchLastId('Vehicle', res => {
        if (!res) {
            setVehicleID(0);
        } else {
            setVehicleID(res.id);
        }
    });

    // Passwords are encrypted.
    db.selectData('Account', ['id', 'username', 'password'], data => {
        if (data === undefined) return;

        for (let i = 0; i < data.length; i++) {
            cacheAccount(data[i].username, data[i].id, data[i].password);
        }

        alt.log(`=====> Cached: ${data.length} Accounts`);
    });

    db.selectData('Character', ['id', 'name'], data => {
        if (data === undefined) return;

        for (let i = 0; i < data.length; i++) {
            cacheCharacter(data[i].id, data[i].name);
        }
    });
}
