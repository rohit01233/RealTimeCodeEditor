# RealTime Collab Editor

Collab Editor is a real-time collaborative JavaScript editor. Users can create rooms, invite collaborators with different permissions, edit the same document through a CodeMirror interface, and retrieve persisted document versions.

## Features

- User registration, login, logout, current-user lookup, and access-token refresh
- JWT-based authentication for REST and Socket.IO connections
- Rooms with `owner`, `editor`, and `viewer` roles
- Owner-only invitations and room deletion
- Real-time collaborative editing using Yjs, CodeMirror, and Socket.IO
- Live collaborator presence, cursor movement, and join/leave notifications
- Viewer read-only mode enforced in both the client and server
- Debounced document persistence to MongoDB
- Automatic version snapshots, retaining the latest 50 snapshots per room

## Architecture

```text
client/  React + Vite frontend
    |
    | REST: /api
    | WebSocket: Socket.IO
    v
server/  Express + Socket.IO backend
    |
    v
MongoDB  users, rooms, documents, and version snapshots
```

The frontend uses React Router, Axios, CodeMirror, Yjs, and `y-codemirror.next`. The backend uses Express for the REST API and Socket.IO for collaboration. Each active room has an in-memory Yjs document; changes are written to MongoDB after five seconds of inactivity and when the last participant disconnects.

## Requirements

- Node.js 18 or newer
- npm
- MongoDB 6 or newer, either:
  - a local MongoDB server running on `127.0.0.1:27017`, or
  - a MongoDB Atlas cluster whose network access allows your current IP

## Installation

From the repository root:

```bash
npm run install:all
```

This installs dependencies for the root, server, and client packages.

## Configuration

### Server environment

Create or update `server/.env`:

```env
MONGO_URI=mongodb://127.0.0.1:27017/collab-editor
JWT_SECRET=replace_with_a_long_random_secret
JWT_REFRESH_SECRET=replace_with_another_long_random_secret
PORT=5000
CLIENT_URL=http://localhost:5173
```

For MongoDB Atlas, replace `MONGO_URI` with your `mongodb+srv://...` connection string. Add the machine's public IP to the Atlas Network Access list, and URL-encode special characters in the database username or password.

Never commit real database credentials or JWT secrets. Use `server/.env.example` as the variable reference.

### Client environment

The client defaults to `http://localhost:5000`. To use another backend URL, create `client/.env`:

```env
VITE_SERVER_URL=http://localhost:5000
```

Vite environment variables must start with `VITE_`.

## Running locally

Make sure MongoDB is running first. With a local Windows MongoDB service, for example:

```powershell
Get-Service MongoDB
Start-Service MongoDB
```

Start both applications from the repository root:

```bash
npm run dev
```

Or run them separately:

```bash
npm run dev:server
npm run dev:client
```

The applications are then available at:

- Frontend: http://localhost:5173
- Backend: http://localhost:5000
- Health check: http://localhost:5000/api/health

For a production-style backend process:

```bash
npm start --prefix server
```

Run that command from the repository root. Running `npm start` at the root is not supported because the root package only defines development orchestration scripts.

## Typical workflow

1. Register an account or sign in.
2. Create a room from the home page.
3. Copy the room link or invite users by email.
4. Open the room in another browser session to test collaboration.
5. Edit the JavaScript document. Editors and owners can modify it; viewers can only observe.
6. Use the room's version history endpoints to inspect saved snapshots.

## Roles and permissions

| Action            | Owner | Editor | Viewer |
| ----------------- | ----- | ------ | ------ |
| View a room       | Yes   | Yes    | Yes    |
| Edit the document | Yes   | Yes    | No     |
| Invite users      | Yes   | No     | No     |
| Delete the room   | Yes   | No     | No     |
| View versions     | Yes   | Yes    | Yes    |

Role checks are performed by the backend. In particular, a viewer's `doc-update` Socket.IO messages are rejected even if the client-side read-only UI is bypassed.

## REST API

The base URL is `http://localhost:5000/api`. Protected endpoints require:

```http
Authorization: Bearer <accessToken>
```

### Authentication

| Method | Endpoint         | Description                                          |
| ------ | ---------------- | ---------------------------------------------------- |
| `POST` | `/auth/register` | Create an account. Body: `{ name, email, password }` |
| `POST` | `/auth/login`    | Sign in. Body: `{ email, password }`                 |
| `POST` | `/auth/refresh`  | Create a new access token. Body: `{ refreshToken }`  |
| `POST` | `/auth/logout`   | Stateless logout acknowledgement                     |
| `GET`  | `/auth/me`       | Return the authenticated user                        |

Passwords must be at least six characters. Access tokens expire after 15 minutes and refresh tokens expire after seven days.

### Rooms

All room endpoints require authentication.

| Method   | Endpoint            | Permission       | Description                              |
| -------- | ------------------- | ---------------- | ---------------------------------------- |
| `POST`   | `/rooms`            | Authenticated    | Create a room. Body: `{ name }`          |
| `GET`    | `/rooms`            | Authenticated    | List rooms for the current user          |
| `GET`    | `/rooms/:id`        | Viewer or higher | Get room metadata                        |
| `POST`   | `/rooms/:id/invite` | Owner            | Invite by email. Body: `{ email, role }` |
| `DELETE` | `/rooms/:id`        | Owner            | Delete a room and its data               |

Valid invitation roles are `viewer` and `editor`.

### Versions

| Method | Endpoint                             | Permission       | Description                     |
| ------ | ------------------------------------ | ---------------- | ------------------------------- |
| `GET`  | `/rooms/:roomId/versions`            | Viewer or higher | List saved snapshots            |
| `GET`  | `/rooms/:roomId/versions/:versionId` | Viewer or higher | Get a snapshot's document state |

## Socket.IO events

Connect to the backend with the access token in the handshake:

```js
io("http://localhost:5000", {
  auth: { token: accessToken },
});
```

### Client to server

| Event              | Payload                 | Description                                                      |
| ------------------ | ----------------------- | ---------------------------------------------------------------- |
| `join-room`        | `{ roomId }`            | Join a permitted room; acknowledgement returns `{ state, role }` |
| `doc-update`       | Binary Yjs update       | Apply and relay a document change; viewers are blocked           |
| `awareness-update` | Binary awareness update | Relay cursor and presence state                                  |
| `cursor-move`      | Cursor data             | Relay lightweight cursor presence                                |

### Server to client

| Event              | Payload                        | Description                              |
| ------------------ | ------------------------------ | ---------------------------------------- |
| `doc-update`       | Binary Yjs update              | Document change from another participant |
| `awareness-update` | Binary awareness update        | Presence and selection updates           |
| `user-joined`      | `{ userId, name }`             | Participant joined the room              |
| `user-left`        | `{ userId, name }`             | Participant disconnected                 |
| `cursor-move`      | Cursor data plus user identity | Participant cursor movement              |

## Project layout

```text
client/
  src/pages/             Login, registration, home, and room screens
  src/components/        Route protection and invitation modal
  src/context/           Authentication state
  src/socket/            Socket.IO and Yjs collaboration hook
  src/api/               Axios client and token refresh handling
server/
  src/controllers/       Authentication, room, and version logic
  src/routes/            Express route definitions
  src/middleware/        JWT and room-role authorization
  src/models/            User, room, document, and snapshot schemas
  src/socket/            Socket.IO auth, collaboration, and persistence
```

## Testing and linting

Run linting for both packages:

```bash
npm run lint
```

Run the role-enforcement integration test while the backend is running:

```bash
node server/test-phase5.js
```

The test creates temporary users and a room, verifies viewer writes are blocked, verifies editor writes are relayed, checks owner-only invitations, checks unauthenticated access, and removes the test room afterward.

## Troubleshooting

### MongoDB connection refused or Atlas whitelist error

Confirm that MongoDB is running and that `server/.env` points to the intended database:

```powershell
Get-Service MongoDB
```

For local MongoDB, use `mongodb://127.0.0.1:27017/collab-editor`. For Atlas, verify the connection string, database credentials, and Atlas Network Access settings.

### Client reports `ERR_CONNECTION_REFUSED` on port 5000

Start the backend from its package directory or the repository root with the prefix:

```bash
npm run dev:server
# or
npm start --prefix server
```

Then verify `http://localhost:5000/api/health` returns a JSON object with `status: "ok"`.

### Port already in use

Change `PORT` in `server/.env` and set the matching `VITE_SERVER_URL` in `client/.env` if the client is connecting to a different host or port.

## Security notes

This project is configured for local development. Before deploying, use strong unique secrets, restrict CORS to the production frontend, protect MongoDB network access, enable HTTPS, and move credentials out of local environment files.
