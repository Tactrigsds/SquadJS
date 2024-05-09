export default {
  // [2023.12.13-03.50.09:051][410]LogSquad: ADMIN COMMAND: Set next layer to AlBasrah_RAAS_v1 from 骀徥ȶ
  regex: /^\[([0-9\.\-:]+)]\[([0-9]+)]LogSquad: ADMIN COMMAND: Set next layer to ([^\s]+)(?: ([^\[]+))? from .+/,
  onMatch: (args, logParser) => {
    const data = {
      raw: args[0],
      time: args[1],
      chainID: args[2],
      nextLayer: args[3],
      nextFactions: args[4]
    };
    logParser.emit('MAP_SET', data);
  }
};
