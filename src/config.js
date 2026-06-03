// Central tuning. Gamefeel and mood live here so they are easy to dial in.
// Units are meters / seconds unless noted.

export const SEED = 1337;

// ---------------------------------------------------------------------------
// Mood & palette — late-afternoon "golden hour" so light is warm and forgiving.
// ---------------------------------------------------------------------------
export const COLORS = {
  skyTop:    0x6fb7e8, // soft zenith blue
  skyMid:    0xbfe0ec, // pale band
  skyHorizon:0xf6e3b8, // warm cream haze at the horizon
  sun:       0xfff1cf,
  sunCore:   0xffe7a8,
  fog:       0xe3dcc0, // warm haze; hides chunk edges, adds depth
  ambientSky:0xbcd8ec,
  ambientGround: 0x4a5a33,

  grass:     0x6aa446,
  grassDry:  0x9fb05c,
  grassLush: 0x4c9440,
  dirt:      0x8a6b46,
  rock:      0x8f8b80,
  sand:      0xd9c79a,
  trunk:     0x6b4f3a,
  trunkLight:0x86684c,
  leafA:     0x6fae3e,
  leafB:     0x8cc24f,
  leafC:     0x4f8f3a,
  leafAutumn:0xd99a3e,
  water:     0x2f7e74,
  waterDeep: 0x1d5b56,
  squirrel:  0x9a6b43, // warm chestnut
  squirrelBelly: 0xf3e6cf,
  patagium:  0xbf8a5a,
};

// ---------------------------------------------------------------------------
// World / forest
// ---------------------------------------------------------------------------
export const WORLD = {
  chunkSize: 64,        // meters per chunk edge
  viewChunks: 5,        // radius of chunks kept loaded around the player
  terrainRes: 24,       // grid subdivisions per chunk edge (mesh density)
  maxHeight: 26,        // amplitude of the big terrain hills
  waterLevel: -2.2,     // global sea/pond level
  treesPerChunk: 14,    // average; varies with local "forest density" noise
  fogNear: 185,
  fogFar: 360,
};

// ---------------------------------------------------------------------------
// Player gamefeel. Tuned for FAST, smooth, momentum-preserving movement that
// never grinds to a halt and reads inputs loosely/forgivingly.
// ---------------------------------------------------------------------------
export const PLAYER = {
  radius: 0.42,
  eyeHeight: 0.5,

  // Ground running
  runSpeed: 16.0,          // top speed on flat ground (fast!)
  sprintSpeed: 22.0,
  accel: 60.0,             // how quickly we reach target velocity
  decel: 38.0,             // friction when no input (gentle, keeps momentum)
  turnResponse: 12.0,      // how fast facing slews toward move direction
  slopeBoost: 0.5,         // downhill speeds you up, uphill slows a touch

  // Jump / leap
  jumpSpeed: 11.0,
  leapForward: 8.0,        // extra forward kick when leaping off a tree
  gravity: 26.0,
  coyoteTime: 0.16,        // forgiving: jump shortly after leaving ground
  jumpBuffer: 0.16,        // forgiving: queue a jump shortly before landing

  // Glide (the flying squirrel's signature)
  glideGravity: 6.0,       // much slower fall with the patagium out
  glideForward: 13.0,      // gentle constant forward pull while gliding
  glideMaxSpeed: 30.0,
  glideTurn: 3.3,          // yaw rate while gliding (rad/s) — responsive banking
  glidePitchDive: 9.0,     // diving trades height for speed
  glideLift: 0.6,          // pulling up converts speed to lift
  glideDrag: 0.28,

  // Climb
  climbSpeed: 9.0,
  climbAccel: 40.0,
  climbSnap: 2.2,          // how strongly we hug the trunk surface
  autoClimbDist: 2.4,      // run this close to a trunk and you scale it
  autoClimbDot: 0.35,      // ...if roughly heading toward it (forgiving)
  branchRunSpeed: 12.0,

  // Swim
  swimSpeed: 8.5,
  swimAccel: 26.0,
  buoyancy: 9.0,           // pushes you toward the surface
  swimBob: 0.12,
  diveSpeed: 6.0,
};

// ---------------------------------------------------------------------------
// Follow camera
// ---------------------------------------------------------------------------
export const CAMERA = {
  distance: 7.2,
  height: 2.6,
  minDistance: 3.0,
  maxDistance: 12.0,
  fov: 62,
  followLerp: 6.0,        // position smoothing
  lookLerp: 9.0,          // target smoothing
  autoAlignRate: 1.6,     // how fast camera drifts behind motion when idle-look
  mouseSensitivity: 0.0026,
  touchSensitivity: 0.006,
  pitchMin: -0.62,        // radians (look down limit)
  pitchMax: 1.15,         // look up limit
  collisionPad: 0.4,
};
