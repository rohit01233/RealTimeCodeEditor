/**
 * Phase 5 role-enforcement test.
 *
 * 1. Owner (testphase2) creates a room.
 * 2. Owner invites a viewer (viewertest@example.com).
 * 3. Viewer connects via socket and tries to send a doc-update.
 * 4. Server should silently block it (no relay, no apply).
 * 5. Editor connects and sends a doc-update → should arrive at owner's socket.
 */

const { io } = require('socket.io-client');
const axios = require('axios').default;

const BASE = 'http://localhost:5000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureUser(name, email, password) {
  try {
    const { data } = await axios.post(`${BASE}/api/auth/register`, { name, email, password });
    return data;
  } catch {
    const { data } = await axios.post(`${BASE}/api/auth/login`, { email, password });
    return data;
  }
}

async function run() {
  console.log('\n🧪 Phase 5 Role-Enforcement Test\n');

  // 1. Login as owner
  const ownerData  = await ensureUser('Owner User',  'owner5@example.com',  'secret123');
  const viewerData = await ensureUser('Viewer User', 'viewer5@example.com', 'secret123');
  const editorData = await ensureUser('Editor User', 'editor5@example.com', 'secret123');

  console.log(`✅ Users ready — owner:${ownerData.user._id}`);

  // 2. Owner creates a room
  const { data: roomData } = await axios.post(
    `${BASE}/api/rooms`,
    { name: 'Phase 5 Test Room' },
    { headers: { Authorization: `Bearer ${ownerData.accessToken}` } }
  );
  const roomId = roomData.room._id;
  console.log(`✅ Room created: ${roomId}`);

  // 3. Invite viewer and editor
  await axios.post(
    `${BASE}/api/rooms/${roomId}/invite`,
    { email: 'viewer5@example.com', role: 'viewer' },
    { headers: { Authorization: `Bearer ${ownerData.accessToken}` } }
  );
  await axios.post(
    `${BASE}/api/rooms/${roomId}/invite`,
    { email: 'editor5@example.com', role: 'editor' },
    { headers: { Authorization: `Bearer ${ownerData.accessToken}` } }
  );
  console.log('✅ Viewer and editor invited');

  // 4. Connect three sockets
  const ownerSocket  = io(BASE, { auth: { token: ownerData.accessToken  }, transports: ['websocket'] });
  const viewerSocket = io(BASE, { auth: { token: viewerData.accessToken }, transports: ['websocket'] });
  const editorSocket = io(BASE, { auth: { token: editorData.accessToken }, transports: ['websocket'] });

  await Promise.all([
    new Promise((r) => ownerSocket.on('connect',  r)),
    new Promise((r) => viewerSocket.on('connect', r)),
    new Promise((r) => editorSocket.on('connect', r)),
  ]);
  console.log('✅ All three sockets connected');

  // 5. All join the room
  const [joinOwner, joinViewer, joinEditor] = await Promise.all([
    new Promise((r) => ownerSocket.emit('join-room',  { roomId }, r)),
    new Promise((r) => viewerSocket.emit('join-room', { roomId }, r)),
    new Promise((r) => editorSocket.emit('join-room', { roomId }, r)),
  ]);

  if (joinOwner.error)  throw new Error(`Owner join failed: ${joinOwner.error}`);
  if (joinViewer.error) throw new Error(`Viewer join failed: ${joinViewer.error}`);
  if (joinEditor.error) throw new Error(`Editor join failed: ${joinEditor.error}`);

  console.log(`✅ Owner joined  as: ${joinOwner.role}`);
  console.log(`✅ Viewer joined as: ${joinViewer.role}`);
  console.log(`✅ Editor joined as: ${joinEditor.role}`);

  if (joinViewer.role !== 'viewer') throw new Error('Expected viewer role');
  if (joinEditor.role !== 'editor') throw new Error('Expected editor role');

  // 6. ── Test: Viewer sends doc-update → owner should NOT receive it ────────
  let viewerUpdateReceived = false;
  ownerSocket.on('doc-update', () => { viewerUpdateReceived = true; });

  viewerSocket.emit('doc-update', [1, 2, 3, 4]);  // fake binary payload
  await sleep(400);  // give server time to relay (or block)

  if (viewerUpdateReceived) {
    throw new Error('❌ Viewer doc-update was relayed — role enforcement FAILED');
  }
  console.log('✅ Viewer doc-update was BLOCKED by server (role enforcement works)');

  // 7. ── Test: Editor sends doc-update → owner SHOULD receive it ────────────
  let editorUpdateReceived = false;
  ownerSocket.once('doc-update', (data) => { editorUpdateReceived = true; });

  editorSocket.emit('doc-update', [5, 6, 7, 8]);
  await sleep(400);

  if (!editorUpdateReceived) {
    throw new Error('❌ Editor doc-update was NOT relayed — unexpected block');
  }
  console.log('✅ Editor doc-update was RELAYED correctly');

  // 8. ── Test: invite endpoint returns 403 for editor-role user ─────────────
  try {
    await axios.post(
      `${BASE}/api/rooms/${roomId}/invite`,
      { email: 'anyone@test.com', role: 'viewer' },
      { headers: { Authorization: `Bearer ${editorData.accessToken}` } }
    );
    throw new Error('Editor was able to invite — should be 403');
  } catch (err) {
    if (err.response?.status === 403) {
      console.log('✅ Editor cannot invite (REST 403 enforced)');
    } else {
      throw err;
    }
  }

  // 9. ── Test: 401 without token ─────────────────────────────────────────────
  try {
    await axios.get(`${BASE}/api/rooms/${roomId}`);
    throw new Error('Should have been 401');
  } catch (err) {
    if (err.response?.status === 401) {
      console.log('✅ Unauthenticated request returns 401');
    } else throw err;
  }

  // Cleanup
  ownerSocket.disconnect();
  viewerSocket.disconnect();
  editorSocket.disconnect();

  // Delete the test room
  await axios.delete(
    `${BASE}/api/rooms/${roomId}`,
    { headers: { Authorization: `Bearer ${ownerData.accessToken}` } }
  );
  console.log('✅ Test room deleted');

  console.log('\n🎉 Phase 5 role-enforcement test PASSED!\n');
  process.exit(0);
}

run().catch((err) => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});
