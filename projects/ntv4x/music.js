"use strict";

(function (root) {
  const motif = {
    heatA: [
      [0, 76], [1, 76], [2, 79], [3, 81], [5, 79], [6, 76], [8, 74], [10, 76], [11, 79], [12, 83], [13, 81], [14, 79]
    ],
    heatB: [
      [0, 76], [2, 79], [3, 83], [4, 86], [6, 83], [7, 81], [8, 79], [10, 81], [11, 83], [12, 88], [13, 86], [14, 83]
    ],
    heatC: [
      [0, 81], [2, 79], [3, 76], [4, 79], [6, 81], [7, 83], [8, 84], [10, 83], [11, 81], [12, 79], [13, 76], [14, 74]
    ],
    heatTurn: [
      [0, 76], [2, 79], [3, 81], [4, 83], [6, 86], [7, 83], [8, 81], [9, 79], [10, 76], [12, 74], [13, 76], [14, 72]
    ],
    coolA: [
      [0, 69], [6, 72], [10, 74], [14, 72]
    ],
    coolB: [
      [0, 67], [6, 69], [10, 72], [14, 69]
    ],
    coolC: [
      [0, 64], [6, 67], [10, 69], [14, 67]
    ],
    coolTurn: [
      [0, 62], [6, 64], [10, 67], [14, 64]
    ]
  };

  function makeSparseSequence(length, events) {
    const sequence = Array(length).fill(null);
    for (const [step, note] of events) {
      sequence[step] = note;
    }
    return sequence;
  }

  function concatEvents(...sections) {
    const events = [];
    let offset = 0;
    for (const section of sections) {
      for (const [step, note] of section) {
        events.push([offset + step, note]);
      }
      offset += 16;
    }
    return events;
  }

  const heatEvents = concatEvents(motif.heatA, motif.heatB, motif.heatC, motif.heatTurn);
  const coolEvents = concatEvents(motif.coolA, motif.coolB, motif.coolC, motif.coolTurn);

  const tracks = {
    heat: {
      bpm: 156,
      arrangement: "heat",
      lead: makeSparseSequence(64, heatEvents),
      bass: [
        40, null, 47, 40, 43, null, 50, 43, 45, null, 52, 45, 43, null, 47, 43,
        40, null, 47, 40, 43, null, 50, 43, 48, null, 55, 48, 47, null, 52, 47
      ],
      arp: [
        64, 67, 71, 76, 64, 67, 71, 76,
        62, 65, 69, 74, 62, 65, 69, 74,
        64, 67, 71, 76, 67, 71, 76, 79,
        65, 69, 72, 77, 64, 67, 71, 74
      ],
      sections: [
        { root: 40, chord: [64, 67, 71, 76], accent: 83 },
        { root: 43, chord: [62, 67, 71, 74], accent: 86 },
        { root: 45, chord: [64, 69, 72, 76], accent: 84 },
        { root: 43, chord: [62, 67, 71, 74], accent: 81 }
      ]
    },
    cool: {
      bpm: 156,
      arrangement: "cool",
      lead: makeSparseSequence(64, coolEvents),
      bass: [
        45, null, null, null, null, null, null, null, 52, null, null, null, null, null, null, null,
        48, null, null, null, null, null, null, null, 55, null, null, null, null, null, null, null,
        43, null, null, null, null, null, null, null, 50, null, null, null, null, null, null, null,
        47, null, null, null, null, null, null, null, 52, null, null, null, null, null, null, null
      ],
      arp: [
        57, null, 64, null, 60, null, 67, null,
        55, null, 62, null, 59, null, 67, null,
        52, null, 60, null, 57, null, 64, null,
        53, null, 60, null, 55, null, 62, null
      ],
      sections: [
        { root: 45, chord: [57, 64, 67, 72], accent: 72 },
        { root: 43, chord: [55, 62, 67, 71], accent: 69 },
        { root: 40, chord: [52, 60, 64, 69], accent: 67 },
        { root: 41, chord: [53, 60, 65, 69], accent: 64 }
      ]
    },
    win: {
      bpm: 132,
      arrangement: "win",
      lead: [76, 79, 83, 88, 86, 83, 84, 88, 91, 88, 86, 84, 83, 86, 88, null],
      bass: [48, 48, 55, 55, 52, 52, 57, 57, 53, 53, 60, 60, 55, 55, 60, 60],
      arp: [64, 67, 72, 76, 67, 72, 76, 79]
    },
    loss: {
      bpm: 82,
      arrangement: "loss",
      lead: [64, null, 63, null, 59, null, 57, null, 55, null, 52, null, 51, null, 52, null],
      bass: [40, null, null, null, 39, null, null, null, 36, null, null, null, 35, null, 36, null],
      arp: [52, 55, 59, 63]
    }
  };

  const exportBeats = {
    heat: 64,
    cool: 64,
    win: 32,
    loss: 32
  };

  const api = { tracks, exportBeats };
  root.NTV4X_MUSIC = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
