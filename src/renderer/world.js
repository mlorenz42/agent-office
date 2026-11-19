/* global window */
(function () {
  const TILE = 32;
  const MIN_COLS = 52;
  const MAX_COLS = 140;
  const OPEN_SPACE_TOP = 13;
  const OPEN_SPACE_LEFT = 2;
  const SLOT_W = 5;
  const SLOT_H = 5;
  const BLOCK_GAP = 1;
  const BAND_GAP = 1;

  const FLOOR = 0;
  const WALL = 1;
  const DESK = 2;
  const TABLE = 3;
  const DECOR = 4;
  const GLASS = 5;

  const MIN_ROOM_WIDTH = 14;

  const RESERVED_DESKS = 2;

  function planSpaces(agents, memory = {}, cols = MIN_COLS) {
    const openSpaceRight = cols - 2;
    const sorted = [...agents].sort(
      (a, b) => a.spaceNumber - b.spaceNumber || a.tabNumber - b.tabNumber || a.paneId.localeCompare(b.paneId),
    );
    const groups = new Map();
    for (const agent of sorted) {
      if (!groups.has(agent.workspaceId)) groups.set(agent.workspaceId, { id: agent.workspaceId, label: agent.space, keys: [] });
      groups.get(agent.workspaceId).keys.push(agent.key);
    }

    const blocks = [];
    let x = OPEN_SPACE_LEFT;
    let y = OPEN_SPACE_TOP;
    let bandHeight = 0;
    [...groups.values()].forEach((group, colorIndex) => {
      const members = assignSeats(group, memory);
      const cols = members.length <= 4 ? 2 : 3;
      const rows = Math.ceil(members.length / cols);
      const width = cols * SLOT_W;
      if (x > OPEN_SPACE_LEFT && x + width > openSpaceRight) {
        x = OPEN_SPACE_LEFT;
        y += bandHeight + BAND_GAP;
        bandHeight = 0;
      }
      blocks.push({ label: group.label, colorIndex, x, y, cols, rows, members });
      x += width + BLOCK_GAP;
      bandHeight = Math.max(bandHeight, rows * SLOT_H);
    });
    for (const spaceId of Object.keys(memory)) if (!groups.has(spaceId)) delete memory[spaceId];
    const bottom = Math.max(y + bandHeight, OPEN_SPACE_TOP + 3 * SLOT_H);
    return { cols, blocks, bottom, signature: JSON.stringify({ cols, blocks }) };
  }

  function planForAspect(agents, memory, aspect) {
    let best = null;
    let bestScale = 0;
    for (let cols = MIN_COLS; cols <= MAX_COLS; cols += 2) {
      const plan = planSpaces(agents, memory, cols);
      const fitScale = Math.min(aspect / cols, 1 / (plan.bottom + 2));
      if (fitScale >= bestScale * (1 - 1e-6)) {
        best = plan;
        bestScale = Math.max(bestScale, fitScale);
      }
    }
    return best;
  }

  function assignSeats(group, memory) {
    const space = memory[group.id] || { capacity: 0, slots: {} };
    memory[group.id] = space;
    for (const key of Object.keys(space.slots)) if (!group.keys.includes(key)) delete space.slots[key];
    const taken = new Set(Object.values(space.slots));
    for (const key of group.keys) {
      if (space.slots[key] !== undefined) continue;
      let slot = 0;
      while (taken.has(slot)) slot += 1;
      space.slots[key] = slot;
      taken.add(slot);
    }
    const highest = Math.max(-1, ...taken) + 1;
    const wanted = Math.max(highest, group.keys.length + RESERVED_DESKS);
    if (space.capacity < wanted || space.capacity > wanted + RESERVED_DESKS) space.capacity = wanted;
    const seats = new Array(space.capacity).fill(null);
    for (const [key, slot] of Object.entries(space.slots)) seats[slot] = key;
    return seats;
  }

  function buildWorld(plan = planSpaces([])) {
    const rows = plan.bottom + 2;
    const COLS = plan.cols;
    const ROOM = Math.max(MIN_ROOM_WIDTH, Math.round(COLS / 4));
    const OFFICE_RIGHT = ROOM - 1;
    const MEETING_LEFT = COLS - ROOM;
    const O = Math.floor((ROOM - 13) / 2);
    const M = MEETING_LEFT + Math.floor((ROOM - 14) / 2) - 32;
    const OFFICE_DOOR = { x: 6 + O, y: 10 };
    const BOSS_CHAIR = { x: 6 + O, y: 3 };
    const VISITOR_SPOT = { x: 6 + O, y: 5 };
    const MEETING_DOOR = { x: 38 + M, y: 10 };
    const grid = Array.from({ length: rows }, () => new Array(COLS).fill(FLOOR));
    const decor = [];

    const set = (x, y, type) => {
      if (y >= 0 && y < rows && x >= 0 && x < COLS) grid[y][x] = type;
    };
    const wallRect = (x0, y0, x1, y1) => {
      for (let x = x0; x <= x1; x++) {
        set(x, y0, WALL);
        set(x, y1, WALL);
      }
      for (let y = y0; y <= y1; y++) {
        set(x0, y, WALL);
        set(x1, y, WALL);
      }
    };
    const place = (kind, x, y, w = 1, h = 1, blocking = true) => {
      decor.push({ kind, x, y, w, h });
      if (blocking) for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) set(x + dx, y + dy, DECOR);
    };

    wallRect(0, 0, COLS - 1, rows - 1);
    wallRect(0, 0, OFFICE_RIGHT, 10);
    wallRect(MEETING_LEFT, 0, COLS - 1, 10);
    set(OFFICE_DOOR.x, OFFICE_DOOR.y, FLOOR);
    set(OFFICE_DOOR.x + 1, OFFICE_DOOR.y, FLOOR);
    set(MEETING_DOOR.x, MEETING_DOOR.y, FLOOR);
    set(MEETING_DOOR.x + 1, MEETING_DOOR.y, FLOOR);
    const entrance = { x: COLS / 2, y: rows - 1 };
    set(entrance.x, entrance.y, FLOOR);
    set(entrance.x - 1, entrance.y, FLOOR);

    for (let x = 4 + O; x <= 8 + O; x++) set(x, 4, DESK);
    const bossDesk = { x: 4 + O, y: 4, w: 5 };
    place('shelf', 1, 1, 3, 1);
    place('plant', OFFICE_RIGHT - 2, 1);
    place('plant', 1, 8);
    place('sofa', 9 + O, 6, 2, 2);
    decor[decor.length - 1].back = 'right';
    decor.push({ kind: 'rug', legend: true, x: 2 + O, y: 7, w: 7, h: 3 });

    const meetingTable = { x: 35 + M, y: 4, w: 8, h: 3 };
    for (let x = meetingTable.x; x < meetingTable.x + meetingTable.w; x++) for (let y = 4; y <= 6; y++) set(x, y, TABLE);
    const meetingSeats = [];
    for (let x = meetingTable.x; x < meetingTable.x + meetingTable.w; x++) {
      meetingSeats.push({ x, y: 3, face: 'down', seat: true }, { x, y: 7, face: 'up', seat: true });
    }
    meetingSeats.push({ x: 34 + M, y: 5, face: 'right', seat: true }, { x: 43 + M, y: 5, face: 'left', seat: true });
    place('whiteboard', 36 + M, 1, 6, 1);
    place('plant', 33 + M, 9);
    place('plant', 44 + M, 9);

    const LL = OFFICE_RIGHT + 1;
    const LR = MEETING_LEFT - 1;
    const C = Math.round(COLS / 2);
    const loungeChairs = [];
    // where agents take a break, spaced so name tags don't overlap; stools, armchairs and beanbags stay walkable
    const loungeSeats = [];
    place('counter', LL + 1, 1, 6, 1);
    place('fridge', LL + 7, 1);
    place('island', LL + 2, 4, 4, 1);
    for (let x = LL + 2; x <= LL + 5; x++) {
      place('stool', x, 5, 1, 1, false);
      if (x === LL + 2) loungeSeats.push({ x, y: 5, face: 'up', seat: true, group: 'bar' });
    }
    for (const tableX of [LL + 2, LL + 6]) {
      place('cafetable', tableX, 8);
      loungeChairs.push({ x: tableX - 1, y: 8, face: 'right' }, { x: tableX + 1, y: 8, face: 'left' });
    }
    decor.push({ kind: 'rug', poster: true, x: C - 4, y: 4, w: 8, h: 3 });

    place('sofa', C - 2, 3, 4, 1);
    place('sofa', C - 2, 7, 4, 1);
    decor[decor.length - 1].back = 'bottom';
    place('armchair', C - 6, 5, 1, 1, false);
    decor[decor.length - 1].back = 'left';
    place('armchair', C + 5, 5, 1, 1, false);
    decor[decor.length - 1].back = 'right';
    loungeSeats.push({ x: C - 6, y: 5, face: 'right', seat: true, group: 'armchair-left' }, { x: C + 5, y: 5, face: 'left', seat: true, group: 'armchair-right' });
    place('cabinet', LR - 6, 1);
    place('cabinet', LR - 5, 1);
    place('cabinet', LR - 4, 1);
    decor.push({ kind: 'corkboard', x: LR - 6, y: 0, w: 3, h: 1 });
    place('watercooler', LR - 1, 1);
    place('beanbag', LR - 4, 7, 1, 1, false);
    place('beanbag', LR - 2, 8, 1, 1, false);
    loungeSeats.push({ x: LR - 4, y: 7, face: 'down', seat: true, group: 'beanbags' }, { x: LR - 2, y: 8, face: 'down', seat: true, group: 'beanbags' });
    // a small table for two in the corner by the cabinets
    place('cafetable', LR - 3, 4);
    loungeChairs.push({ x: LR - 4, y: 4, face: 'right' }, { x: LR - 2, y: 4, face: 'left' });
    place('plant', LL, 9);
    place('plant', LR, 9);
    for (let x = LL; x <= LR; x++) if (x !== C - 1 && x !== C) set(x, 10, WALL);

    const desks = [];
    const deskByKey = new Map();
    const spaceAreas = [];
    const partitions = [];
    const blockedEdges = new Set();
    const block = (x1, y1, x2, y2) => {
      blockedEdges.add(`${x1},${y1}|${x2},${y2}`);
      blockedEdges.add(`${x2},${y2}|${x1},${y1}`);
    };
    for (const teamBlock of plan.blocks) {
      spaceAreas.push({
        label: teamBlock.label,
        colorIndex: teamBlock.colorIndex,
        x: teamBlock.x,
        y: teamBlock.y,
        w: teamBlock.cols * SLOT_W,
        h: teamBlock.rows * SLOT_H,
      });
      teamBlock.members.forEach((key, index) => {
        const col = index % teamBlock.cols;
        const top = teamBlock.y + Math.floor(index / teamBlock.cols) * SLOT_H;
        const x = teamBlock.x + 1 + col * SLOT_W;
        const y = top + 1;
        set(x, y, DESK);
        set(x + 1, y, DESK);
        const desk = { x, y, ownerKey: key, chair: { x: x + 1, y: y + 1, face: 'up', seat: true } };
        desks.push(desk);
        if (key) deskByKey.set(key, desk);

        for (const column of [x - 1, x, x + 1, x + 2]) block(column, top - 1, column, top);
        partitions.push({ kind: 'back', x: (x - 1) * TILE + 6, y: top * TILE + 6, w: 4 * TILE - 8 });
        const hasRightNeighbour = col < teamBlock.cols - 1 && index < teamBlock.members.length - 1;
        if (hasRightNeighbour) {
          for (const rowY of [top, y]) block(x + 3, rowY, x + 4, rowY);
          partitions.push({ kind: 'divider', x: (x + 4) * TILE - 2, y: top * TILE + 6, h: (y + 1) * TILE - 2 - (top * TILE + 6) });
        }
      });
    }
    for (let y = OPEN_SPACE_TOP + 1; y < rows - 2; y += 4) place('plant', COLS - 2, y);
    const pods = buildMeetingPods(plan, rows, set);
    placeHelpRugs(decor, spaceAreas, pods, COLS, rows);

    // waiting chairs along the hall wall right of my office door, up to the lounge door;
    // when they are all taken, further agents stand in the second lane
    const queueChairs = [];
    for (let x = OFFICE_DOOR.x + 3; x <= C - 3; x += 2) queueChairs.push({ x, y: 11, face: 'down', seat: true });
    const queueSpots = [...queueChairs];
    for (let x = OFFICE_DOOR.x + 4; queueSpots.length < 24; x += 2) queueSpots.push({ x, y: 12, face: 'left' });

    return {
      cols: COLS,
      roomWidth: ROOM,
      rows,
      grid,
      decor,
      desks,
      deskByKey,
      spaceAreas,
      partitions,
      blockedEdges,
      signature: plan.signature,
      bossDesk,
      meetingTable,
      meetingSeats,
      meetingRooms: [
        { id: 'main', shared: true, seats: meetingSeats, center: { x: meetingTable.x + meetingTable.w / 2, y: 5 } },
        ...pods,
      ],
      pods,
      signs: [
        { text: window.I18n.t('roomOffice'), x: ROOM / 2, y: 0.5 },
        { text: window.I18n.t('roomMeeting'), x: (MEETING_LEFT + COLS) / 2, y: 0.5 },
        { text: window.I18n.t('roomLounge'), x: COLS / 2, y: 0.5 },
      ],
      queueSpots,
      entrance,
      bossChair: { ...BOSS_CHAIR, face: 'down', seat: true, boss: true },
      chairs: [
        ...desks.map((desk) => desk.chair),
        ...meetingSeats,
        ...pods.flatMap((pod) => pod.seats),
        ...loungeChairs,
        ...queueChairs,
        { ...BOSS_CHAIR, face: 'down', seat: true, boss: true },
      ],
      // the chairs come in pairs at small tables; each pair is a group that sits together
      loungeSeats: loungeChairs
        .map((chair, index) => ({ ...chair, seat: true, group: `table-${index >> 1}` }))
        .concat(loungeSeats)
        .map((seat) => ({ ...seat, compactLabel: true })),
      visitorSpot: { ...VISITOR_SPOT, face: 'up' },
      zoneAt,
    };
  }

  const POD_CELL_W = 7;
  const POD_CELL_H = 6;

  // Shortcut rugs go on the bottom strip wherever no team area or meeting pod is; the ones that
  // don't fit are left out (the shortcuts are also in the Help menu and the office tooltip).
  const HELP_RUG_ORDER = ['walk', 'agents', 'view', 'terminals'];
  const HELP_RUG_W = 7;

  function placeHelpRugs(decor, spaceAreas, pods, cols, rows) {
    const top = rows - 4;
    const blocked = [
      ...spaceAreas.map((area) => ({ x0: area.x - 1, x1: area.x + area.w, y0: area.y - 1, y1: area.y + area.h })),
      ...pods.map((pod) => {
        const [x0, y0] = pod.id.split('-').slice(1).map(Number);
        return { x0, x1: x0 + POD_CELL_W - 1, y0, y1: y0 + POD_CELL_H - 1 };
      }),
    ];
    const free = (x) => !blocked.some((area) => x >= area.x0 && x <= area.x1 && top <= area.y1 && top + 2 >= area.y0);
    const rugs = [...HELP_RUG_ORDER];
    let x = 1;
    while (rugs.length && x + HELP_RUG_W - 1 <= cols - 3) {
      const clash = [...Array(HELP_RUG_W).keys()].find((dx) => !free(x + dx));
      if (clash !== undefined) {
        x += clash + 1;
        continue;
      }
      decor.push({ kind: 'rug', help: rugs.shift(), x, y: top, w: HELP_RUG_W, h: 3 });
      x += HELP_RUG_W + 1;
    }
  }

  function buildMeetingPods(plan, rows, set) {
    const taken = plan.blocks.map((teamBlock) => ({
      x0: teamBlock.x - 1,
      y0: teamBlock.y - 1,
      x1: teamBlock.x + teamBlock.cols * SLOT_W,
      y1: teamBlock.y + teamBlock.rows * SLOT_H,
    }));
    const right = plan.cols - 3;
    const bottom = rows - 2;
    const pods = [];
    for (let y0 = OPEN_SPACE_TOP; y0 + POD_CELL_H <= bottom; y0 += POD_CELL_H) {
      for (let x0 = OPEN_SPACE_LEFT; x0 + POD_CELL_W <= right; x0 += POD_CELL_W) {
        const cell = { x0, y0, x1: x0 + POD_CELL_W - 1, y1: y0 + POD_CELL_H - 1 };
        const overlaps = taken.some((area) => cell.x0 <= area.x1 && cell.x1 >= area.x0 && cell.y0 <= area.y1 && cell.y1 >= area.y0);
        if (!overlaps) pods.push(buildPod(x0, y0, set));
      }
    }
    return pods;
  }

  function buildPod(x0, y0, set) {
    const x1 = x0 + 5;
    const y1 = y0 + 4;
    for (let x = x0; x <= x1; x++) {
      set(x, y0, GLASS);
      set(x, y1, GLASS);
    }
    for (let y = y0; y <= y1; y++) {
      set(x0, y, GLASS);
      set(x1, y, GLASS);
    }
    const door = { x: x0 + 2, y: y1 };
    set(door.x, door.y, FLOOR);
    set(x0 + 2, y0 + 2, TABLE);
    set(x0 + 3, y0 + 2, TABLE);
    const seats = [
      { x: x0 + 2, y: y0 + 1, face: 'down', seat: true },
      { x: x0 + 3, y: y0 + 1, face: 'down', seat: true },
      { x: x0 + 1, y: y0 + 2, face: 'right', seat: true },
      { x: x0 + 4, y: y0 + 2, face: 'left', seat: true },
      { x: x0 + 3, y: y0 + 3, face: 'up', seat: true },
      { x: x0 + 1, y: y0 + 3, face: 'up', seat: true },
    ];
    return {
      id: `pod-${x0}-${y0}`,
      shared: false,
      seats,
      center: { x: x0 + 2.5, y: y0 + 2 },
      table: { x: x0 + 2, y: y0 + 2, w: 2, h: 1 },
      area: { x: x0, y: y0, w: 6, h: 5 },
    };
  }

  function zoneAt(x, y) {
    if (x < this.roomWidth && y <= 10) return 'office';
    if (x >= this.cols - this.roomWidth && y <= 10) return 'meeting';
    if (y <= 10) return 'lounge';
    if (y <= OPEN_SPACE_TOP - 1) return 'hall';
    return 'open';
  }

  function walkable(world, x, y) {
    return y >= 0 && y < world.rows && x >= 0 && x < world.cols && world.grid[y][x] === FLOOR;
  }

  function crossesPartition(world, x1, y1, x2, y2) {
    return world.blockedEdges.has(`${x1},${y1}|${x2},${y2}`);
  }

  function findPath(world, from, to) {
    const start = { x: Math.round(from.x), y: Math.round(from.y) };
    const key = (p) => p.y * world.cols + p.x;
    const goalKey = key(to);
    const previous = new Map([[key(start), null]]);
    const queue = [start];
    while (queue.length) {
      const current = queue.shift();
      if (key(current) === goalKey) {
        const path = [];
        for (let node = current; node; node = previous.get(key(node))) path.unshift(node);
        return path;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const next = { x: current.x + dx, y: current.y + dy };
        const nextKey = key(next);
        if (previous.has(nextKey)) continue;
        if (nextKey !== goalKey && !walkable(world, next.x, next.y)) continue;
        if (crossesPartition(world, current.x, current.y, next.x, next.y)) continue;
        previous.set(nextKey, current);
        queue.push(next);
      }
    }
    return [start, to];
  }

  window.World = { TILE, FLOOR, WALL, DESK, TABLE, DECOR, GLASS, planSpaces, planForAspect, buildWorld, walkable, crossesPartition, findPath };
})();
