import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = path => readFile(new URL('../'+path,import.meta.url),'utf8');

test('deployed runtime verifier requires exact source and installed Git blobs', async()=>{
 const ps=await source('scripts/Test-HeavenBotDeployment.ps1');
 assert.match(ps,/HEAVEN1_REQUIRED/);
 assert.match(ps,/source_sha/);
 assert.match(ps,/installed_sha/);
 assert.match(ps,/INSTALLED_SHA_MISMATCH/);
 assert.match(ps,/Verify-GitBlob/);
 assert.match(ps,/INSTALLED_BLOB_DRIFT/);
});

test('verifier binds ready observation to owned Windows task and live node PID',async()=>{
 const ps=await source('scripts/Test-HeavenBotDeployment.ps1');
 assert.match(ps,/Get-ScheduledTask/);
 assert.match(ps,/BOT_TASK_IDENTITY_UNVERIFIED/);
 assert.match(ps,/discord\.ready/);
 assert.match(ps,/sourceSha/);
 assert.match(ps,/Get-CimInstance/);
 assert.match(ps,/GetOwnerSid/);
 assert.match(ps,/GATEWAY_PROCESS_IDENTITY_CHANGED/);
});

test('Gateway ready log includes matching source, pid, and observed timestamp',async()=>{
 const app=await source('src/index.mjs');
 const installer=await source('scripts/Install-HeavenBot.ps1');
 assert.match(app,/sourceSha/);
 assert.match(app,/observedAt/);
 assert.match(app,/process\.pid/);
 assert.match(installer,/HEAVEN_BOT_SOURCE_SHA/);
});
