import LogEvent from '../../core/log-event.js';

export default class PlayerRevived extends LogEvent {
  constructor(server, data = {}) {
    super(server, data);

    this.woundTime = data.woundTime;

    this.victim = data.victim;
    this.attacker = data.attacker;
    this.weapon = data.weapon;
    this.damage = data.damage;

    this.reviver = data.reviver;
  }
}