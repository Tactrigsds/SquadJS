import axios from 'axios'
import {ServerEvents} from "../utils/constants.js";
import BasePlugin from './base-plugin.js';

export default class HttpEventForwarder extends BasePlugin {
  static get name() {
    return 'HttpEventForwarder';
  }

  static get description() {
    return ('Forwards squadjs server events to external services');
  }

  static get defaultEnabled() {
    return false;
  }

  static get optionsSpecification() {
    return {
      connections: {
        description: 'An array of destinations to forward events to',
        default: [],
        example: [
          {
            name: 'My Connection',
            url: 'https://IP:PORT/endpoint',
            bearerToken: "<token>",
            events: ['NEW_GAME']
          }
        ]
      }
    };
  }

  mount() {
    this.eventHandlers = [];

    const allEvents = Object.values(ServerEvents);
    for (const connection of this.options.connections) {
      for (const event of connection.events) {
        if (!allEvents.includes(event)) {
          this.error(1, `Invalid event ${event} in connection ${connection.name}`);
          continue;
        }
        const handler = (data) => {
          const payload = JSON.stringify({[event]: data});
          this.verbose(2, `Sending event ${event} to ${connection.name} (${connection.url})`);
          axios.post(connection.url, payload, {
            headers: {
              Authorization: `Bearer ${connection.bearerToken}`,
              'Content-Type': 'application/json',

              // This exists as a low-tech solution to prevent most replay attacks. The server can reject requests that are too far in the past. Probably fine for our purposes, but could be replace with an actual nonce or something.
              'X-Event-Time': Date.now()
            }
          }).then(res => {
            this.verbose(2, `Event ${event} sent to ${connection.name}`);
          }).catch(error => {
            this.error(1, `Failed to send event ${event} to ${connection.name}: ${error.message}`);
          });
        };

        // Store reference to event handler for later removal
        this.eventHandlers.push({
          event,
          handler
        });

        this.server.on(event, handler);
      }
    }
  }

  unmount() {
    if (this.eventHandlers && this.eventHandlers.length) {
      this.verbose(1, `Removing ${this.eventHandlers.length} event handlers`);
      for (const { event, handler } of this.eventHandlers) {
        this.server.removeListener(event, handler);
      }
      this.eventHandlers = [];
    }
  }
}
