
import DiscordBasePlugin from './discord-base-plugin.js';
import Sequelize from 'sequelize';
const { QueryTypes } = Sequelize;

export default class DiscordRoundStartedScoreboard extends DiscordBasePlugin {
  static get description() {
    return 'The <code>DiscordRoundStartedScoreboard</code> plugin will build and send a scoreboard to a Discord channel.';
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      ...DiscordBasePlugin.optionsSpecification,
      channelID: {
        required: true,
        description: 'The ID of the channel to post the scooreboard to.',
        default: '',
        example: '667741905228136459'
      },
      color: {
        required: false,
        description: 'The color of the embed.',
        default: 16761867
      },
      database: {
        required: true,
        connector: 'sequelize',
        description: 'The Sequelize connector to log server information to.',
        default: 'mysql'
      },
      headers:{
        required: false,
        description:"Object containing the header information for the db table",
        default: {
            "kills":"Most Kills",
            "deaths":"Most Deaths",
            "revives":"Most Revives",
            "revived":"Most Revived",
            "teamkilled":"Most Teamkilled",
            "teamkills":"Most Teamkills"
        }
      },
      title_prefix:{
        required:false,
        description:"Discord message prefix to put in the title",
        default: "Scoreboard | "
      }
    };
  }

  /**
   * Get the base query to drive the scoreboards. Since SQLLite doesnt support temp tables, CTE is the best we got
   */
  static get baseQuery(){
    return `WITH sub_kills as (
            SELECT
              attackerName as player,
                  attackerTeamId as teamid,
                  count(*) as cnt
            FROM DBLog_Deaths 
              WHERE \`match\` = (SELECT max(id) FROM DBLog_Matches WHERE endTime IS NOT NULL)
              AND teamkill = 0
              GROUP BY attackerName, attackerTeamId
          ),
          sub_teamkills as (
            SELECT
              attackerName as player,
                  attackerTeamId as teamid,
                  count(*) as cnt
            FROM DBLog_Deaths 
              WHERE \`match\` = (SELECT max(id) FROM DBLog_Matches WHERE endTime IS NOT NULL)
              AND teamkill = 1
              GROUP BY attackerName, attackerTeamID
          ),
          sub_teamkilled as (
            SELECT
              victimName as player,
                  victimTeamID as teamid,
                  count(*) as cnt
            FROM DBLog_Deaths 
              WHERE \`match\` = (SELECT max(id) FROM DBLog_Matches WHERE endTime IS NOT NULL)
              AND teamkill = 1
              GROUP BY victimName,victimTeamID
          ),
          sub_deaths as (
            SELECT
              victimName as player,
                  victimTeamID as teamid,
                  count(*) as cnt
            FROM DBLog_Deaths 
              WHERE \`match\` = (SELECT max(id) FROM DBLog_Matches WHERE endTime IS NOT NULL)
              GROUP BY victimName,victimTeamID
          ),
          sub_wounds as (
            SELECT
              victimName as player,
                  victimTeamID as teamid,
                  count(*) as cnt
            FROM DBLog_Deaths 
              WHERE "match" = (SELECT max(id) FROM DBLog_Matches WHERE endTime IS NOT NULL)
              GROUP BY victimName,victimTeamID
          ),
          sub_revives as (
            SELECT
              reviverName as player,
                  reviverTeamID as teamid,
                  count(*) as cnt
            FROM DBLog_Revives 
              WHERE \`match\` = (SELECT max(id) FROM DBLog_Matches WHERE endTime IS NOT NULL)
              GROUP BY reviverName, reviverTeamID
          ),
          sub_revived as (
            SELECT
              victimName as player,
              victimTeamID as teamid,
                  count(*) as cnt
            FROM DBLog_Revives 
              WHERE \`match\` = (SELECT max(id) FROM DBLog_Matches WHERE endTime IS NOT NULL)
              GROUP BY victimName, victimTeamID
          ),
          sub_all_players_pregroup as (
             SELECT player, teamid FROM sub_kills
             UNION SELECT player, teamid FROM sub_teamkills
             UNION SELECT player, teamid FROM sub_deaths
             UNION SELECT player, teamid FROM sub_wounds
             UNION SELECT player, teamid FROM sub_revives
          ),
          sub_all_players as (
             SELECT player,teamid FROM sub_all_players_pregroup GROUP BY player, teamid
          ),
          sub_scoreboard_stats as (
          SELECT 
            ap.player,
              ap.teamid,
              coalesce(k.cnt,0) as kills,
              coalesce(d.cnt,0) as deaths,
              coalesce(tk.cnt,0) as teamkills,
              coalesce(tkd.cnt,0) as teamkilled,
              coalesce(r.cnt,0) as revives,
              coalesce(w.cnt,0) as wounds,
              coalesce(u.cnt,0) as revived
          FROM sub_all_players ap 
          LEFT JOIN sub_kills k ON k.player = ap.player AND k.teamid=ap.teamid
          LEFT JOIN sub_deaths d ON d.player = ap.player AND d.teamid=ap.teamid
          LEFT JOIN sub_teamkills tk ON tk.player = ap.player AND tk.teamid=ap.teamid
          LEFT JOIN sub_teamkilled tkd ON tkd.player = ap.player AND tkd.teamid=ap.teamid
          LEFT JOIN sub_revives r ON r.player = ap.player AND r.teamid=ap.teamid
          LEFT JOIN sub_wounds w ON w.player = ap.player AND w.teamid=ap.teamid
          LEFT JOIN sub_revived u ON u.player = ap.player AND u.teamid=ap.teamid
          ),
          t_scoreboards as (
            SELECT * FROM sub_scoreboard_stats
          )
          `;
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);
    this.onRoundStart = this.onRoundStart.bind(this);
  }

  async mount() {
    this.server.on('NEW_GAME', this.onRoundStart);
  }

  async unmount() {
    this.server.removeEventListener('NEW_GAME', this.onRoundStart);
  }

  async onRoundStart(info) {
    let scoreboardData = await this.buildScoreboard();
    try {
      await this.sendDiscordMessage({
      embed: {
        title: `${this.options.title_prefix}${scoreboardData.match.map} - ${scoreboardData.match.layer}`,
        description: `${scoreboardData.match.team1} (${scoreboardData.team1.kills} kills) vs ${scoreboardData.match.team2} (${scoreboardData.team2.kills} kills)  || ${scoreboardData.match.winnerTeam} won with ${scoreboardData.match.tickets} tickets in ${scoreboardData.match.round_mins} minutes.`,
        color: this.options.color,
        fields: [
          {
            name: `${this.options.headers.kills}`,
            value: this.formatTable(scoreboardData.awards.kills),
            inline:true
          },
          {
            name: `${this.options.headers.deaths}`,
            value: this.formatTable(scoreboardData.awards.deaths),
            inline:true,
          },
          {
            name: `${this.options.headers.revives}`,
            value: this.formatTable(scoreboardData.awards.revives),
            inline: true,
          },
          {
            name: `${this.options.headers.revived}`,
            value: this.formatTable(scoreboardData.awards.revived),
            inline:true,
          },
          {
            name: `${this.options.headers.teamkilled}`,
            value: this.formatTable(scoreboardData.awards.teamkilled),
            inline:true,
          },
          {
            name: `${this.options.headers.teamkills}`,
            value: this.formatTable(scoreboardData.awards.teamkills),
            inline:true,
          }
        ],
        timestamp: info.time.toISOString()
      }
    });
    } catch (e) {
      console.log('Error occured when attempting to create scoreboard')
      console.log(e)
    }
  }

  /**
   * Format the data in a super simple table
   */ 
  formatTable(data){
    let str = "";
    data.forEach((element) => {
      str += Object.values(element).join(" - ") + "\n"
    });
    return str;
  }


  async buildScoreboard(){
    await new Promise(r => setTimeout(r, 30*1000));
    let scoreboardData = {
      "awards":{
        "kills":[],
        "deaths":[],
        "revives":[],
        "teamkilled":[],
        "teamkills":[]
      },
      "team1":{},
      "team2":{},
      "match":{}
    };
      scoreboardData.awards.kills = await this.options.database.query(DiscordRoundStartedScoreboard.baseQuery +"SELECT player, kills FROM t_scoreboards ORDER BY kills DESC LIMIT 3;",{ type: QueryTypes.SELECT });
      scoreboardData.awards.deaths = await this.options.database.query(DiscordRoundStartedScoreboard.baseQuery +"SELECT player, deaths FROM t_scoreboards ORDER BY deaths DESC LIMIT 3;",{ type: QueryTypes.SELECT });
      scoreboardData.awards.revives = await this.options.database.query(DiscordRoundStartedScoreboard.baseQuery +"SELECT player, revives FROM t_scoreboards ORDER BY revives DESC LIMIT 3;",{ type: QueryTypes.SELECT });
      scoreboardData.awards.revived = await this.options.database.query(DiscordRoundStartedScoreboard.baseQuery +"SELECT player, revived FROM t_scoreboards ORDER BY revived DESC LIMIT 3;",{ type: QueryTypes.SELECT });
      scoreboardData.awards.teamkilled = await this.options.database.query(DiscordRoundStartedScoreboard.baseQuery +"SELECT player, teamkilled FROM t_scoreboards ORDER BY teamkilled DESC LIMIT 3;",{ type: QueryTypes.SELECT });
      scoreboardData.awards.teamkills = await this.options.database.query(DiscordRoundStartedScoreboard.baseQuery +"SELECT player, teamkills FROM t_scoreboards ORDER BY teamkills DESC LIMIT 3;",{ type: QueryTypes.SELECT });
      scoreboardData.team1 = await this.options.database.query(DiscordRoundStartedScoreboard.baseQuery +"SELECT sum(kills) as kills FROM t_scoreboards where teamid = 1;",{ type: QueryTypes.SELECT });
      scoreboardData.team1 = scoreboardData.team1[0];
      scoreboardData.team2 = await this.options.database.query(DiscordRoundStartedScoreboard.baseQuery +"SELECT sum(kills) as kills FROM t_scoreboards where teamid = 2;",{ type: QueryTypes.SELECT });
      scoreboardData.team2 = scoreboardData.team2[0];
      scoreboardData.match = await this.options.database.query("SELECT map, layer, tickets, winnerTeam, winnerTeamId, team1, team2, timestampdiff(MINUTE, startTime,endTime) as round_mins FROM DBLog_Matches where id = (SELECT max(id) FROM DBLog_Matches WHERE endTime IS NOT NULL)",{ type: QueryTypes.SELECT });
      scoreboardData.match = scoreboardData.match[0]
      return scoreboardData;
  }
}
