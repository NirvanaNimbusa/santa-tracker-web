import {html, LitElement} from '@polymer/lit-element';
import {ifDefined} from 'lit-html/directives/if-defined';

const WINS = Object.freeze([7, 56, 448, 73, 146, 292, 273, 84]);
const SHOW_LINE_TIME = 1000;
const RESTART_GAME_TIME_MIN = 10 * 1000;
const RESTART_GAME_TIME_MAX = 60 * 1000;

const delay = (ms) => new Promise((r) => window.setTimeout(r, ms));

export class TicTacToeElement extends LitElement {
  static get properties() {
    return {
      isPlaying: {type: Boolean},
      turn: {type: Boolean},
      redScore: {type: Number},
      blueScore: {type: Number},
      cellClasses: {type: Array},
      winClass: {type: String},
      redTeamClass: {type: String, default: ''},
      blueTeamClass: {type: String, default: ''},
    };
  }

  constructor() {
    super();

    this.cellsAvailable_ = [];
  }

  connectedCallback() {
    this.play_();
  }

  play_() {
    if (!this.isPlaying || !this.cellsAvailable_.length) {
      this.isPlaying = true;

      // Setup a new game
      this.redScore = 0;
      this.blueScore = 0;

      this.turn = Boolean(Math.random() >= .5);

      this.winClass = '';
      this.redTeamClass = '';
      this.blueTeamClass = '';

      this.cellsAvailable_ = [0, 1, 2, 3, 4, 5, 6, 7, 8];
      this.cellClasses = new Array(9).fill('empty');
    }

    // Random is the best AI....
    const rnd = Math.floor(Math.random() * this.cellsAvailable_.length);
    const cell = this.cellsAvailable_.splice(rnd, 1).pop();

    this.playCell_(cell);
  }

  /**
   * @param {number} index
   * @private 
   */
  async playCell_(index) {
    const moveTime = 500;
    const drawTime = 200;
    const doneDrawTime = 500;
    const moveBackTime = 500;
    const playAgainTime = 1000;
    const posClass = `to-pos-${index + 1}`;

    if (this.turn) {
      this.redTeamClass = posClass;
    } else {
      this.blueTeamClass = posClass;
    }

    await delay(moveTime);

    if (this.turn) {
      this.redTeamClass += ' draw';
    } else {
      this.blueTeamClass += ' draw';
    }

    await delay(drawTime);

    const c = Array.from(this.cellClasses);
    c[index] = this.turn ? 'red' : 'blue';
    this.cellClasses = c;

    await delay(doneDrawTime);

    if (this.turn) {
      this.redTeamClass = '';
    } else {
      this.blueTeamClass = '';
    }

    await delay(moveBackTime);


    if (this.turn) {
      this.redScore += (1 << index);
      var w = this.checkWin_(this.redScore);
      if (w !== false) {
        this.showWin_('red', w);
        return;
      }
    } else {
      this.blueScore += (1 << index);
      var w = this.checkWin_(this.blueScore);
      if (w !== false) {
        this.showWin_('blue', w);
        return;
      }
    }

    if (!this.cellsAvailable_.length) {
      // Draw
      window.ga('send', 'event', 'village', 'tic-tac', 'draw', {nonInteraction: true});
    }

    this.turn = !this.turn;

    await delay(playAgainTime);
    this.play_();
  }


  /**
   * 
   * @param {string} player 
   * @param {number} w 
   */
  async showWin_(player, w) {
    this.isPlaying = false;

    window.ga('send', 'event', 'village', 'tic-tac', player, {nonInteraction: true});

    await delay(SHOW_LINE_TIME);
    this.winClass = `${player} pos-${w}`;

    const restartTime = RESTART_GAME_TIME_MIN +
        Math.random()* (RESTART_GAME_TIME_MAX - RESTART_GAME_TIME_MIN);
    await delay(restartTime);

    this.winClass = '';
    this.play_();
  }

  /** 
   * @param {number} score
  */
  checkWin_(score) {
    for (let i = 0; i < WINS.length; ++i) {
      if ((WINS[i] & score) === WINS[i]) {
        return i;
      }
    }
    return false;
  }

  update(changedProperties) {
    super.update(changedProperties);
  }

  render() {

    return html`
    <style>${_style`tictactoe`}</style>
    <div>
      ${this.cellClasses.map(c => html`<div class="cell ${c}"></div>`)}
    </div>
    <div id="elves-red" class="elves ${this.redTeamClass}"></div>
    <div id="elves-blue" class="elves ${this.blueTeamClass}"></div>
    <div id="win" class="${this.winClass}"></div>
    `;
  }
}

customElements.define('tic-tac-toe', TicTacToeElement);
