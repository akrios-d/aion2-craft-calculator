import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStore } from '../core/app-store';
import { applyInventoryImport } from '../core/io/imports';
import { ArmorySnapshot, planEquipmentInventory, SearchCandidate, armoryLinks, buildSnapshot, parseArmoryJson, pickCandidate } from '../core/armory';
import { BisEntry, BisList, BisImportResult, BIS_SLOTS, compareBis, starterBisList, parseBisCsv, parseBisJson } from '../core/bis';
import { parseCsv } from '../core/io/csv';
import { KISK_REGIONS, KiskCard, KiskLine, KiskSnapshot, kiskToShareTable, parseKiskGear } from '../core/kisk';
import { CLASSES, DEFAULT_BANDS, effectiveShareTable, EMPTY_TEMPLATE, EXAMPLE_JSON, PieceScore, SHARE_SLOTS, ShareImportResult, ShareTable, observedMaxRolls, overallScore, parseShareCsv, parseShareJson, scorePiece, shareSlotOf } from '../core/share-score';
import { TrPipe } from '../core/tr.pipe';

@Component({
  selector: 'app-armory',
  imports: [TrPipe, FormsModule, DatePipe, DecimalPipe],
  styles: `
    .panel { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: .75rem 1rem; display: grid; gap: .6rem; margin: .75rem 0 1rem; }
    .row { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; }
    textarea { width: 100%; min-height: 6rem; font-family: monospace; font-size: .8rem; }
    .gh { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; padding: .9rem 1rem; border-radius: 12px; background: linear-gradient(135deg, var(--win), var(--panel)); border: 1px solid var(--line); }
    .chips { display: flex; gap: .4rem; flex-wrap: wrap; margin-bottom: .3rem; }
    .gchip { padding: .1rem .6rem; border-radius: 999px; background: #ffffff14; border: 1px solid #ffffff2e; font-size: .8rem; }
    .gname { margin: 0; font-size: 1.8rem; line-height: 1.2; }
    .cp { font-size: .8rem; vertical-align: middle; padding: .1rem .5rem; border-radius: 6px; background: #ebb71922; color: #ffd966; border: 1px solid #ebb71977; }
    .otile { display: grid; justify-items: center; padding: .4rem .9rem; border-radius: 10px; border: 2px solid currentColor; background: var(--bg); min-width: 6rem; }
    .otile b { font-size: 2rem; line-height: 1; }
    .linkbtn { background: none; border: 0; padding: 0; color: var(--gold); text-decoration: underline; cursor: pointer; font: inherit; }
    .hint { margin: .3rem 0; }
    .tabs { display: flex; gap: .4rem; margin: .5rem 0; flex-wrap: wrap; }
    .tab { padding: .35rem .8rem; border-radius: 6px; border: 1px solid var(--gold); background: var(--panel); color: var(--fg); cursor: pointer; }
    .tab.on { background: var(--gold); color: var(--bg); font-weight: 600; }
    .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .75rem; }
    @media (max-width: 960px) { .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 600px) { .cards { grid-template-columns: 1fr; } .gh { flex-direction: column; } }
    .card { display: flex; flex-direction: column; gap: .5rem; padding: .7rem .8rem; border-radius: 12px; background: linear-gradient(160deg, var(--win), var(--panel)); border: 1px solid #ffffff26; min-height: 11rem; color: var(--fg); }
    .rar-Legend { border-color: #ff9d3c88; } .rar-Unique { border-color: #ffc94d88; } .rar-Epic { border-color: #c79a4a88; } .rar-Rare { border-color: #8aa0b588; }
    .lb-A { border-color: #dfe3ee; } .lb-B { border-color: #6d7b8c; } .lb-C, .lb-D { border-color: #ffffff26; }
    .lb-S, .lb-Sp { border-color: #ffc94d; box-shadow: 0 0 .9rem #ffc94d55; }
    .lb-BIS, .card.bis { border-color: #ffd966; box-shadow: 0 0 1rem #ffd96688, 0 0 1.6rem #ebb71955; }
    .ch { display: flex; gap: .6rem; align-items: flex-start; }
    .ct { display: grid; gap: .15rem; min-width: 0; flex: 1; }
    .ct small { color: var(--muted); }
    .nm { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cico { position: relative; flex: none; width: 44px; height: 44px; border-radius: 8px; background: #0008; display: grid; place-items: center; border: 1px solid #ffffff22; }
    .cico img { width: 100%; height: 100%; border-radius: 8px; }
    .cico.star { color: #ffd966; font-size: 1.6rem; }
    .plus { position: absolute; right: -6px; bottom: -6px; font-style: normal; font-size: .7rem; font-weight: 700; background: #ebb719; color: #1a1300; border-radius: 6px; padding: 0 .25rem; }
    .sc { width: fit-content; font-size: .75rem; padding: 0 .45rem; border-radius: 999px; background: #ffffff14; border: 1px solid #ffffff2e; color: var(--fg); }
    .lt { flex: none; font-weight: 800; font-size: 1.1rem; padding: .1rem .55rem; border-radius: 8px; border: 2px solid currentColor; background: var(--bg); }
    .lc-Sp, .lc-S { color: #ffd966; } .lc-A { color: #eceff7; } .lc-B { color: #9fb3c8; } .lc-C { color: #e0a43a; } .lc-D { color: #ff8a8a; } .lc-BIS { color: #ffd966; }
    .rows { list-style: none; margin: 0; padding: 0; display: grid; gap: .45rem; flex: 1; }
    .rows li { display: grid; grid-template-columns: auto 1fr auto; column-gap: .45rem; align-items: center; }
    .rows li > .lb { grid-column: 1 / 3; } .rows li > .ck + .lb { grid-column: 2; } .rows li > .pc { grid-column: 3; }
    .rows li > .pb { grid-column: 1 / -1; }
    .lb small { color: var(--muted); } .pc { font-size: .85rem; font-variant-numeric: tabular-nums; }
    .pb { height: 5px; border-radius: 3px; background: #ffffff1c; overflow: hidden; margin-top: .2rem; }
    .pb > i { display: block; height: 100%; background: #7d8796; }
    .pb > i.hi { background: linear-gradient(90deg, var(--gold), #ffd966); }
    .ck { width: 1.1rem; height: 1.1rem; border-radius: 50%; border: 2px solid var(--muted); display: grid; place-items: center; font-size: .7rem; color: #1a1300; }
    .ck.on { background: #ffd966; border-color: #ffd966; font-weight: 800; }
    li.miss { opacity: .7; }
    .cf { display: flex; justify-content: space-between; align-items: center; gap: .5rem; border-top: 1px solid #ffffff1c; padding-top: .45rem; min-height: 1.8rem; }
    .cf small { color: var(--muted); }
    .flipbtn { padding: .15rem .7rem; border-radius: 999px; background: #ffffff10; border: 1px solid #ffffff44; color: #fff; cursor: pointer; }
    .flipbtn:hover, .flipbtn:focus-visible, .flipbtn[aria-pressed='true'] { background: #ffd96633; border-color: #ffd966; }
    .st-match { color: var(--ok); } .st-mismatch { color: var(--warn); } .st-missing { color: var(--err); }
    .ok { color: var(--ok); } .err { color: var(--err); } .warn { color: var(--warn); }
    .bar { height: .5rem; background: #ffffff18; border-radius: 4px; overflow: hidden; } .bar > i { display: block; height: 100%; background: var(--ok); }
    .tog { padding: .2rem .75rem; border-radius: 999px; background: transparent; border: 1px solid var(--line); color: var(--fg); cursor: pointer; }
    .tog.on { background: linear-gradient(180deg, #ebb719, #ac770c); color: var(--gold-ink); border-color: var(--gold); font-weight: 700; }
    td { vertical-align: middle; }
  `,
  template: `
    <h2>{{ 'Armory and BiS' | tr }}</h2>
    <p class="muted"><small>{{ 'UX inspired by kisk.app.' | tr }} <a href="https://kisk.app" target="_blank" rel="noopener noreferrer">kisk.app</a></small></p>

    <section class="panel">
      <h3>{{ 'kisk.app lookup' | tr }}</h3>
      <div class="row">
        <select [ngModel]="kRegion()" (ngModelChange)="kRegion.set($event)" [attr.aria-label]="'Region' | tr">
          @for (r of kiskRegions; track r) { <option [value]="r">{{ r.toUpperCase() }}</option> }
        </select>
        <input [ngModel]="kServer()" (ngModelChange)="kServer.set($event)" [placeholder]="'Server' | tr" size="12" />
        <input [ngModel]="kName()" (ngModelChange)="kName.set($event)" (keydown.enter)="kiskLookup()" [placeholder]="'Character name' | tr" />
        <button (click)="kiskLookup()" [disabled]="kBusy() || kName().trim().length < 2">{{ kBusy() ? ('Looking up…' | tr) : ('Look up on kisk.app' | tr) }}</button>
      </div>
      <p class="muted"><small>{{ 'One click fetches one kisk.app page through a small serverless function (no polling). kisk.app data is third-party and may be inaccurate; we are not affiliated with kisk.app or NCSOFT. Gear data originates from the official armory, shares from cielui.com via kisk.app.' | tr }}</small></p>
      @if (kError()) { <p class="err">{{ kError() | tr }}</p> }
    </section>

    @if (store.kiskCache().length) {
      <section class="row">
        @for (s of store.kiskCache(); track s.url) {
          <span class="row">
            <button class="tog" [class.on]="s.url === kSnap()?.url" (click)="kSel.set(s.url)">{{ s.report.name }} ({{ s.report.server }})</button>
            <button class="mini" (click)="store.removeKisk(s.url)" [attr.aria-label]="'Remove' | tr">✕</button>
          </span>
        }
      </section>
    }

    @if (kSnap(); as k) {
      <section class="panel">
        <header class="gh">
          <div class="gh-main">
            <div class="chips">
              @if (k.report.faction) { <span class="gchip">{{ k.report.faction }}</span> }
              <span class="gchip">Lv {{ k.report.level }} {{ k.report.className }}</span>
              <span class="gchip">{{ k.report.server }}</span>
              @if (k.report.legion) { <span class="gchip">{{ k.report.legion }}</span> }
            </div>
            <h3 class="gname">{{ k.report.name }} @if (k.report.cp) { <span class="cp">{{ k.report.cp }} CP</span> }</h3>
            <small class="muted">{{ 'Source: kisk.app' | tr }} · <a [href]="k.url" target="_blank" rel="noopener noreferrer">{{ 'Open on kisk.app' | tr }}</a> · {{ 'Fetched on' | tr }} {{ k.fetchedAt | date: 'short' }}</small>
          </div>
          @if (k.report.overallLetter) {
            <div class="otile lc-{{ lc(k.report.overallLetter) }}" [attr.aria-label]="('Overall gear grade' | tr) + ': ' + k.report.overallLetter">
              <b>{{ k.report.overallLetter }}</b><small>{{ 'Gear' | tr }}</small>
            </div>
          }
        </header>
        <p class="muted"><small>{{ 'Scores, grades, shares and Ideal cards below are kisk.app data (cielui.com, Korea PvE, may be outdated or inaccurate), not our own calculation. The Ideal lists also act as the BiS for this class unless you import your own table.' | tr }}</small></p>
        <div class="tabs" role="tablist" [attr.aria-label]="'Character sections' | tr" (keydown)="kTabKey($event)">
          @for (t of kTabs(); track t.key) {
            <button type="button" role="tab" class="tab" [id]="'ktab-' + t.key" [class.on]="kTab() === t.key" [attr.aria-selected]="kTab() === t.key" [attr.aria-controls]="'kpanel'" [attr.tabindex]="kTab() === t.key ? 0 : -1" (click)="setKTab(t.key)">{{ t.label | tr }} ({{ t.count }})</button>
          }
        </div>
        <div id="kpanel" role="tabpanel" [attr.aria-labelledby]="'ktab-' + kTab()">
        @for (g of kGroups(); track g.title) {
          @if (g.cards.length && g.key === kTab()) {
            <div class="cards">
              @for (c of g.cards; track c.slot) {
                @let flip = kFlipped(c);
                <article class="card {{ kClass(c) }}">
                  <div class="ch">
                    <span class="cico" [class.star]="flip">
                      @if (flip) { <span aria-hidden="true">★</span> } @else {
                        @if (c.icon) { <img [src]="c.icon" alt="" loading="lazy" referrerpolicy="no-referrer" /> }
                        @if (c.enchant) { <i class="plus">{{ c.enchant }}</i> }
                      }
                    </span>
                    <div class="ct">
                      <b class="nm" [title]="flip ? c.ideal!.title : c.name">{{ flip ? c.ideal!.title : c.name }}</b>
                      <small>{{ flip ? c.ideal!.subtitle : c.subtitle }}</small>
                      @if ((flip ? c.ideal!.score : c.score) !== null) { <span class="sc">{{ 'Score' | tr }} {{ flip ? c.ideal!.score : c.score }}</span> }
                    </div>
                    @if (flip ? c.ideal!.letter : c.letter) { <span class="lt lc-{{ lc(flip ? c.ideal!.letter : c.letter) }}">{{ flip ? c.ideal!.letter : c.letter }}</span> }
                  </div>
                  <ul class="rows">
                    @for (l of (flip ? c.ideal!.lines : c.lines); track $index) {
                      <li [class.miss]="flip && !l.have">
                        @if (flip) {
                          <span class="ck" [class.on]="l.have" role="img" [attr.aria-label]="(l.have ? 'Equipped item has this line' : 'Equipped item lacks this line') | tr">{{ l.have ? '✓' : '' }}</span>
                        }
                        <span class="lb">{{ l.stat }} <small>{{ flip ? l.value : kLine(l) }}</small></span>
                        <span class="pc">{{ l.share }}%</span>
                        <div class="pb"><i [class.hi]="l.share >= 70" [style.width.%]="l.share"></i></div>
                      </li>
                    }
                  </ul>
                  @if (c.ideal) {
                    <div class="cf">
                      <small>{{ flip ? ('Yours has {a} of these {b}' | tr: { a: kHave(c), b: c.ideal.lines.length }) : ('{a} of {b} ideal lines' | tr: { a: kHave(c), b: c.ideal.lines.length }) }}</small>
                      <button type="button" class="flipbtn" [attr.aria-pressed]="flip" (click)="kToggle(c)">{{ flip ? ('Yours' | tr) : ('Ideal' | tr) }} ⟳</button>
                    </div>
                  }
                </article>
              }
            </div>
          }
        }
        @if (kTab() === 'unscored' && k.report.unscored.length) {
          <div class="cards">
            @for (u of k.report.unscored; track $index) {
              <article class="card">
                <div class="ch">
                  <span class="cico">
                    @if (u.icon) { <img [src]="u.icon" alt="" loading="lazy" referrerpolicy="no-referrer" /> }
                    @if (u.enchant) { <i class="plus">{{ u.enchant }}</i> }
                  </span>
                  <div class="ct"><b class="nm" [title]="u.name">{{ u.name }}</b><small>{{ u.subtitle }}</small></div>
                </div>
              </article>
            }
          </div>
        }
        </div>
      </section>
    }

    <section class="panel">
      <h3>{{ 'Character lookup' | tr }}</h3>
      <div class="row">
        <select [ngModel]="region()" (ngModelChange)="region.set($event)">
          <option value="la">LA</option><option value="eu">EU</option><option value="na">NA</option><option value="asia">ASIA</option>
        </select>
        <input [ngModel]="server()" (ngModelChange)="server.set($event)" [placeholder]="'Server' | tr" size="12" />
        <input [ngModel]="keyword()" (ngModelChange)="keyword.set($event)" (keydown.enter)="lookup()" [placeholder]="'Character name' | tr" />
        <button (click)="lookup()" [disabled]="loading() || keyword().trim().length < 2">{{ loading() ? ('Looking up…' | tr) : ('Look up' | tr) }}</button>
      </div>
      @if (lookupError()) { <p class="err">{{ lookupError() | tr }}</p> }
      @if (candidates().length) {
        <table>
          <thead><tr><th>{{ 'Name' | tr }}</th><th>{{ 'Server' | tr }}</th><th>{{ 'Level' | tr }}</th><th></th></tr></thead>
          <tbody>
            @for (c of candidates(); track c.characterId) {
              <tr>
                <td>{{ c.name }}</td><td>{{ c.serverName }}</td><td>{{ c.level }}</td>
                <td>
                  <button (click)="load(c)" [disabled]="loading()">{{ 'Load' | tr }}</button>
                  <a class="chip" [href]="links(c).info" target="_blank" rel="noopener noreferrer">info</a>
                  <a class="chip" [href]="links(c).equipment" target="_blank" rel="noopener noreferrer">equipment</a>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>

    @if (store.data().armoryCache.length) {
      <section class="row">
        @for (s of store.data().armoryCache; track s.key) {
          <span class="row">
            <button class="tog" [class.on]="s.key === selectedKey()" (click)="selectedKey.set(s.key)">{{ s.profile.name }}@if (s.profile.serverName) { ({{ s.profile.serverName }}) }</button>
            <button class="mini" (click)="store.removeSnapshot(s.key)" [attr.aria-label]="'Remove' | tr">✕</button>
          </span>
        }
      </section>
    }

    @if (snap(); as s) {
      <section class="panel">
        <header class="gh">
          <div class="gh-main">
            <div class="chips">
              @if (s.profile.raceName) { <span class="gchip">{{ s.profile.raceName }}</span> }
              <span class="gchip">@if (s.profile.level) { Lv {{ s.profile.level }} }{{ s.profile.className }}</span>
              @if (s.profile.serverName) { <span class="gchip">{{ s.profile.serverName }}</span> }
            </div>
            <h3 class="gname">{{ s.profile.name }} @if (s.profile.combatPower) { <span class="cp">CP {{ s.profile.combatPower }}</span> }</h3>
            <small class="muted">{{ 'Fetched on' | tr }} {{ s.fetchedAt | date: 'short' }}</small>
          </div>
          @if (overall(); as o) {
            <div class="otile lc-{{ lc(o.letter) }}" [attr.aria-label]="('Overall gear grade' | tr) + ': ' + o.letter">
              <b>{{ o.letter }}</b><small>{{ 'Gear' | tr }}</small>
              <small>{{ o.percent | number: '1.0-1' }}% · {{ o.pieces }} {{ 'Items' | tr }}</small>
            </div>
          }
        </header>
        @if (table()) {
          <p class="muted"><small>{{ 'Share-based score following the method publicly described at kisk.app/scoring. Our own implementation: scores are not the same as kisk. Largest rolls are unknown, so values are approximate (≈).' | tr }}</small>
            @if (shareCredit()) { <br /><small>{{ shareCredit() }} · <a href="https://kisk.app/scoring" target="_blank" rel="noopener noreferrer">kisk.app</a> / <a href="https://cielui.com/stats/engrave" target="_blank" rel="noopener noreferrer">cielui.com</a> · {{ 'Korea PvE data, may be outdated or differ from Global.' | tr }}</small> }
            @if (tableOrigin() === 'merged' || tableOrigin() === 'user') { <br /><small>{{ 'Your imported table overrides the baseline for the slots it defines.' | tr }}</small> }
          </p>
        } @else {
          <p class="warn">{{ 'No share table available for this class: items are shown unscored. Import one below (Score tables).' | tr }}</p>
        }
        @for (grp of groups(); track grp.title) {
          <h4>{{ grp.title | tr }}</h4>
          @if (!grp.views.length && grp.title === 'Arcana') { <p class="muted">{{ 'No arcana returned by the armory.' | tr }}</p> }
          <div class="cards">
            @for (v of grp.views; track v.item.slot) {
              @let flip = v.ideal.length > 0 && isFlipped(v.item.slot);
              @let got = haveCount(v);
              <article class="card" [class.flip]="flip" [class]="cardClass(v, flip)">
                <div class="ch">
                  @if (flip) { <span class="cico star" aria-hidden="true">★</span> }
                  @else if (isUrl(v.item.icon)) { <span class="cico"><img [src]="v.item.icon" referrerpolicy="no-referrer" alt="" loading="lazy" />@if (v.item.enchant) { <i class="plus">+{{ v.item.enchant }}</i> }</span> }
                  @else { <span class="cico" aria-hidden="true">@if (v.item.enchant) { <i class="plus">+{{ v.item.enchant }}</i> }</span> }
                  <div class="ct">
                    @if (flip) {
                      <b class="nm">{{ 'Ideal' | tr }} {{ cls() }} {{ v.item.slotName }}</b>
                      <small>{{ 'Best in slot' | tr }}</small>
                    } @else {
                      <b class="nm" [title]="v.item.name">{{ v.item.name }}</b>
                      <small>{{ v.item.slotName }} · {{ v.item.grade }}@if (v.item.exceed) { , {{ 'exceed' | tr }} {{ v.item.exceed }} }</small>
                    }
                    @if (flip) { <span class="sc">{{ 'Score' | tr }} 100</span> }
                    @else if (v.ps) { <span class="sc">{{ 'Score' | tr }} {{ v.ps.percent | number: '1.0-0' }}@if (v.ps.approximate) { ≈ }</span> }
                  </div>
                  @if (flip) { <span class="lt lc-BIS">BiS</span> }
                  @else if (v.ps) { <span class="lt lc-{{ lc(v.ps.letter) }}">{{ v.ps.letter }}</span> }
                </div>
                @if (flip) {
                  <ul class="rows">
                    @for (l of v.ideal; track l.stat) {
                      <li [class.miss]="!hasLine(v, l.stat)">
                        <span class="ck" [class.on]="hasLine(v, l.stat)" role="img" [attr.aria-label]="(hasLine(v, l.stat) ? 'Equipped item has this line' : 'Equipped item lacks this line') | tr">{{ hasLine(v, l.stat) ? '✓' : '' }}</span>
                        <span class="lb">{{ l.stat }}@if (l.maxRoll) { <small> {{ l.maxRoll }}</small> }</span>
                        <span class="pc">{{ l.share }}%</span>
                        <span class="pb"><i [class.hi]="l.share >= 50" [style.width.%]="l.share"></i></span>
                      </li>
                    }
                  </ul>
                } @else {
                  @if (!v.item.stats?.length) {
                    <p class="hint"><small>{{ 'No stat lines in the armory data.' | tr }} <button type="button" class="linkbtn" (click)="kiskFromArmory()" [disabled]="kBusy()">{{ 'Load details from kisk.app' | tr }}</button></small></p>
                  }
                  <ul class="rows">
                    @for (st of v.item.stats ?? []; track st.name) {
                      @let sh = shareOf(v, st.name);
                      <li>
                        <span class="lb">{{ st.name }} <small>{{ st.value }}@if (st.max) { / {{ st.max }} }</small></span>
                        @if (sh !== null) { <span class="pc">{{ sh }}%</span><span class="pb"><i [class.hi]="sh >= 50" [style.width.%]="sh"></i></span> }
                      </li>
                    }
                  </ul>
                }
                <footer class="cf">
                  @if (v.ideal.length) {
                    <small>@if (flip) { {{ 'Yours has {a} of these {b}' | tr: { a: got, b: v.ideal.length } }} } @else { {{ '{a} of {b} ideal lines' | tr: { a: got, b: v.ideal.length } }} }</small>
                    <button type="button" class="flipbtn" [attr.aria-pressed]="flip" (click)="toggleFlip(v.item.slot)">{{ flip ? ('Yours' | tr) : ('Ideal' | tr) }} ⟳</button>
                  }
                </footer>
              </article>
            }
          </div>
        }
        @if (!anyStats()) { <p class="muted"><small>{{ 'The NCSOFT armory returns the equipped items but no per-line stats or arcana skill lines; kisk.app provides them (current / max and share %).' | tr }} <button type="button" class="linkbtn" (click)="kiskFromArmory()" [disabled]="kBusy()">{{ 'Load details from kisk.app' | tr }}</button></small></p> }
        <h4>{{ 'Add equipped items to inventory' | tr }}</h4>
        <p class="muted"><small>{{ 'Only the equipped gear is added (quantity 1 per piece), matched by exact name to the recipe catalogue; unmatched pieces are listed below, never dropped. The armory does not expose materials or warehouse contents, so those are not imported.' | tr }}</small></p>
        <div class="row">
          <button (click)="invMode.set('merge')">{{ 'Preview merge' | tr }}</button>
          <button (click)="invMode.set('replace')">{{ 'Preview replace' | tr }}</button>
        </div>
        @if (invPreview(); as ip) {
          <table>
            <thead><tr><th>{{ 'Item' | tr }}</th><th>{{ 'Before' | tr }}</th><th>{{ 'After' | tr }}</th><th></th></tr></thead>
            <tbody>@for (c of ip.res.changes; track $index) { <tr><td>{{ c.label }}</td><td>{{ c.before ?? '' }}</td><td>{{ c.after ?? '' }}</td><td>{{ c.kind }}</td></tr> }</tbody>
          </table>
          @for (u of ip.plan.unresolved; track $index) { <p class="warn">{{ u.slotName }}: {{ u.name }} - {{ u.reason | tr }}</p> }
          @if (invMode() === 'replace') { <p class="warn">{{ 'Replace removes every inventory item not equipped by this character.' | tr }}</p> }
          <div class="row"><button (click)="applyInv()" [disabled]="!ip.plan.records.length">{{ 'Apply to inventory' | tr }}</button><button (click)="invMode.set(null)">{{ 'Cancel' | tr }}</button></div>
        }
      </section>
    }

    <section class="panel">
      <h3>{{ 'Best in Slot (BiS)' | tr }}</h3>
      <p class="muted">{{ 'No BiS data is shipped: there is no verified source. Define lists yourself or import JSON/CSV (columns: class, slot, item, id, notes).' | tr }}</p>
      <div class="row">
        <label>{{ 'Class' | tr }}
          <input list="classes" [ngModel]="className()" (ngModelChange)="className.set($event)" />
          <datalist id="classes">@for (l of store.data().bisLists; track l.className) { <option [value]="l.className"></option> }</datalist>
        </label>
        @if (list()) { <button class="mini" (click)="store.removeBisList(list()!.className)">{{ 'Delete list' | tr }}</button> }
        <button (click)="exportBis()" [disabled]="!store.data().bisLists.length">{{ 'Export BiS JSON' | tr }}</button>
      </div>

      <div class="row">
        <select [ngModel]="slot()" (ngModelChange)="slot.set($event)">@for (x of slots; track x) { <option [value]="x">{{ x }}</option> }</select>
        <input [ngModel]="itemName()" (ngModelChange)="itemName.set($event)" [placeholder]="'Item name' | tr" />
        <input [ngModel]="itemId()" (ngModelChange)="itemId.set($event)" [placeholder]="'Armory id (optional)' | tr" size="12" />
        <input [ngModel]="notes()" (ngModelChange)="notes.set($event)" [placeholder]="'Notes' | tr" />
        <button (click)="addEntry()" [disabled]="!canAdd()">{{ 'Add' | tr }}</button>
      </div>

      @if (comparison(); as c) {
        <div class="bar"><i [style.width.%]="c.total ? (100 * c.matched) / c.total : 0"></i></div>
        <b>{{ c.matched }} / {{ c.total }} {{ 'BiS pieces equipped' | tr }}</b>
        <table>
          <thead><tr><th>{{ 'Slot' | tr }}</th><th>BiS</th><th>{{ 'Equipped' | tr }}</th><th>{{ 'Status' | tr }}</th><th></th></tr></thead>
          <tbody>
            @for (r of c.rows; track r.entry.slot) {
              <tr>
                <td>{{ r.entry.slot }}</td>
                <td>@if (r.entry.itemName) { {{ r.entry.itemName }}@if (r.entry.notes) { <small class="muted"> · {{ r.entry.notes }}</small> } } @else { <input [placeholder]="'Item name' | tr" (change)="setItem(r.entry, $any($event.target).value)" /> }</td>
                <td>{{ r.equipped?.name ?? '—' }}</td>
                <td class="st-{{ r.status }}">{{ statusLabel(r.status) | tr }}</td>
                <td><button class="mini" (click)="removeEntry(r.entry)">✕</button></td>
              </tr>
            }
          </tbody>
        </table>        @if (craftable().length) {
          <div class="row">
            <span>{{ 'Missing pieces with a known recipe' | tr }}: {{ craftable().length }}</span>
            <button (click)="addToPlans()">{{ 'Add to crafting plans' | tr }}</button>
          </div>
        }
      } @else if (list()) {
        <table>
          <thead><tr><th>{{ 'Slot' | tr }}</th><th>BiS</th><th></th></tr></thead>
          <tbody>
            @for (e of list()!.entries; track e.slot) {
              <tr><td>{{ e.slot }}</td><td>{{ e.itemName }}</td><td><button class="mini" (click)="removeEntry(e)">✕</button></td></tr>
            }
          </tbody>
        </table>
        <p class="muted">{{ 'Look up a character above to compare with this list.' | tr }}</p>
      } @else {
        <p class="muted">{{ 'No BiS list for this class yet.' | tr }}</p>
        <button (click)="createStarter()" [disabled]="!currentClass()">{{ 'Create starter list (all slots)' | tr }}</button>
      }

      <h4>{{ 'Import BiS' | tr }}</h4>
      <textarea [ngModel]="bisText()" (ngModelChange)="bisText.set($event)" placeholder='[{"className":"gladiator","entries":[{"slot":"MainHand","name":"..."}]}]'></textarea>
      <div class="row"><button (click)="previewBis()" [disabled]="!bisText().trim()">{{ 'Validate and preview' | tr }}</button></div>
      @if (bisPreview(); as p) {
        @for (e of p.errors; track $index) { <p class="err">{{ e }}</p> }
        @for (w of p.warnings; track $index) { <p class="warn">{{ w }}</p> }
        @for (l of p.lists; track l.className) { <p class="ok">{{ l.className }}: {{ l.entries.length }} {{ 'Items' | tr }}</p> }
        @if (p.lists.length) {
          <div class="row">
            <button (click)="applyBis('merge')">{{ 'Merge' | tr }}</button>
            <button (click)="applyBis('replace')">{{ 'Replace' | tr }}</button>
          </div>
        }
      }
    </section>

    <section class="panel">
      <h3>{{ 'Score tables' | tr }}</h3>
      <p class="muted">{{ 'Import, per class, the share of top players carrying each stat line on each slot (JSON, or CSV: class, slot, stat, share, maxRoll). Slots: weapon, guard, torso, pants, helmet, shoulders, gloves, boots, cape, necklace, earrings, rings, bracelet, arcana. The app already loads a baseline (kisk.app / cielui.com snapshot); tables you import override it per class and slot. The empty template and the example below use fake numbers. Without maxRoll the observed maximum is used and the score is marked approximate (≈). Optional "bands" override the letter thresholds.' | tr }}</p>
      <div class="row">
        @for (t of store.data().shareTables; track t.className) {
          <span class="chip">{{ t.className }} <button class="mini" (click)="store.removeShareTable(t.className)" [attr.aria-label]="'Remove' | tr">✕</button></span>
        }
        <button (click)="shareText.set(example)">{{ 'Load fake example' | tr }}</button>
        <button (click)="shareText.set(template())">{{ 'Load empty template' | tr }}</button>
      </div>
      <textarea [ngModel]="shareText()" (ngModelChange)="shareText.set($event)"></textarea>
      <div class="row"><button (click)="previewShare()" [disabled]="!shareText().trim()">{{ 'Validate and preview' | tr }}</button></div>
      @if (sharePreview(); as p) {
        @for (e of p.errors; track $index) { <p class="err">{{ e }}</p> }
        @for (w of p.warnings; track $index) { <p class="warn">{{ w }}</p> }
        @for (x of p.tables; track x.className) { <p class="ok">{{ x.className }}: {{ lineCount(x) }} {{ 'Items' | tr }}</p> }
        @if (p.tables.length) {
          <div class="row"><button (click)="applyShare('merge')">{{ 'Merge' | tr }}</button><button (click)="applyShare('replace')">{{ 'Replace' | tr }}</button></div>
        }
      }
    </section>
  `,
})
export class ArmoryPage {
  readonly store = inject(AppStore);
  readonly slots = BIS_SLOTS;
  readonly region = signal('la');
  readonly server = signal('Zikel');
  readonly loading = signal(false);
  readonly lookupError = signal('');
  readonly keyword = signal('');
  readonly candidates = signal<SearchCandidate[]>([]);
  readonly selectedKey = signal('');
  readonly className = signal('');
  readonly slot = signal(BIS_SLOTS[0]);
  readonly itemName = signal('');
  readonly itemId = signal('');
  readonly notes = signal('');
  readonly bisText = signal('');
  readonly bisPreview = signal<BisImportResult | null>(null);

  readonly snap = computed<ArmorySnapshot | undefined>(() => {
    const cache = this.store.data().armoryCache;
    return cache.find((s) => s.key === this.selectedKey()) ?? cache[0];
  });
  readonly list = computed<BisList | undefined>(() => {
    const cls = (this.className().trim() || this.snap()?.profile.className || '').toLowerCase();
    return this.store.data().bisLists.find((l) => l.className === cls);
  });
  readonly comparison = computed(() => {
    const l = this.list();
    const s = this.snap();
    return l && s ? compareBis(l, s) : null;
  });
  readonly craftable = computed(() => {
    const c = this.comparison();
    if (!c) return [];
    const byName = new Map(this.store.craftableItems().map((i) => [i.name.toLowerCase(), i.id]));
    const byId = new Set(byName.values());
    const ids = c.missing.map((r) => (r.entry.itemId && byId.has(r.entry.itemId) ? r.entry.itemId : byName.get(r.entry.itemName.toLowerCase()))).filter((x): x is string => !!x);
    return [...new Set(ids)];
  });

  readonly example = EXAMPLE_JSON;
  readonly kiskRegions = KISK_REGIONS;
  readonly kRegion = signal('la');
  readonly kServer = signal('zikel');
  readonly kName = signal('Akrios');
  readonly kBusy = signal(false);
  readonly kError = signal('');
  readonly kSel = signal('');
  readonly kSnap = computed(() => { const c = this.store.kiskCache(); return c.find((s) => s.url === this.kSel()) ?? c[0] ?? null; });
  readonly kTabs = computed(() => { const r = this.kSnap()?.report; return [{ key: 'gear', label: 'Gear', count: r?.gear.length ?? 0 }, { key: 'unscored', label: 'Unscored', count: r?.unscored.length ?? 0 }, { key: 'arcana', label: 'Arcana', count: r?.arcana.length ?? 0 }]; });
  readonly kTab = signal<string>(((): string => { try { const v = localStorage.getItem('aion2-craft-lab.armory-tab'); return v === 'unscored' || v === 'arcana' ? v : 'gear'; } catch { return 'gear'; } })());
  setKTab(k: string): void { this.kTab.set(k); try { localStorage.setItem('aion2-craft-lab.armory-tab', k); } catch { /* ignore */ } }
  kTabKey(e: KeyboardEvent): void {
    const keys = this.kTabs().map((t) => t.key); let i = keys.indexOf(this.kTab());
    if (e.key === 'ArrowRight') i = (i + 1) % keys.length; else if (e.key === 'ArrowLeft') i = (i + keys.length - 1) % keys.length; else if (e.key === 'Home') i = 0; else if (e.key === 'End') i = keys.length - 1; else return;
    e.preventDefault(); this.setKTab(keys[i]);
    setTimeout(() => document.getElementById('ktab-' + keys[i])?.focus());
  }
  readonly kFlip = signal<ReadonlySet<string>>(new Set());
  readonly kGroups = computed(() => { const r = this.kSnap()?.report; return r ? [{ key: 'gear', title: 'Gear', cards: r.gear }, { key: 'arcana', title: 'Arcana', cards: r.arcana }] : []; });
  kFlipped(c: KiskCard): boolean { return !!c.ideal && this.kFlip().has(c.slot); }
  kToggle(c: KiskCard): void { const n = new Set(this.kFlip()); if (!n.delete(c.slot)) n.add(c.slot); this.kFlip.set(n); }
  kHave(c: KiskCard): number { return c.ideal?.lines.filter((l) => l.have).length ?? 0; }
  kClass(c: KiskCard): string { return this.kFlipped(c) ? 'bis' : 'lb-' + this.lc(c.letter); }
  kLine(l: KiskLine): string { return l.max !== undefined && l.max !== l.value ? `${l.value} / ${l.max}` : l.value; }

  kiskFromArmory(): void {
    const s = this.snap();
    if (!s) return;
    this.kName.set(s.profile.name);
    if (s.profile.serverName) this.kServer.set(s.profile.serverName.toLowerCase());
    void this.kiskLookup();
  }

  async kiskLookup(): Promise<void> {
    const name = this.kName().trim();
    this.kError.set('');
    this.kBusy.set(true);
    try {
      const q = new URLSearchParams({ region: this.kRegion(), server: this.kServer().trim(), name });
      const res = await fetch(`/api/kisk?${q}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(res.status === 429 ? 'Too many lookups, wait a minute.' : (body as { error?: string }).error ?? 'kisk.app lookup failed.');
      const snap: KiskSnapshot = { url: body.url, fetchedAt: body.fetchedAt, region: this.kRegion(), server: this.kServer().trim().toLowerCase(), report: parseKiskGear(body.html) };
      this.store.saveKisk(snap);
      this.kSel.set(snap.url);
      this.kFlip.set(new Set());
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      this.kError.set(e instanceof SyntaxError || m.includes('kisk') || m.includes('Too many') || m.includes('invalid') || m.includes('not found') || m.includes('unavailable') || m.includes('large') ? m : 'Could not read the kisk.app page (its layout may have changed): ' + m);
    } finally {
      this.kBusy.set(false);
    }
  }

  readonly flipped = signal<ReadonlySet<number>>(new Set());
  isFlipped(slot: number): boolean {
    return this.flipped().has(slot);
  }
  toggleFlip(slot: number): void {
    const n = new Set(this.flipped());
    if (!n.delete(slot)) n.add(slot);
    this.flipped.set(n);
  }
  lc(letter: string): string {
    return letter === 'S+' ? 'Sp' : letter === 'BiS' ? 'BIS' : letter.charAt(0);
  }
  cardClass(v: { item: { grade: string }; ps: PieceScore | null }, flip: boolean): string {
    return flip ? 'card bis flip' : `card rar-${v.item.grade}${v.ps ? ' lb-' + this.lc(v.ps.letter) : ''}`;
  }
  hasLine(v: { ps: PieceScore | null }, stat: string): boolean {
    return !!v.ps?.lines.find((l) => l.stat === stat)?.have;
  }
  haveCount(v: { ps: PieceScore | null }): number {
    return v.ps?.lines.filter((l) => l.have).length ?? 0;
  }
  readonly invMode = signal<'merge' | 'replace' | null>(null);
  readonly invPreview = computed(() => {
    const mode = this.invMode();
    const s = this.snap();
    if (!mode || !s) return null;
    const d = this.store.data();
    const plan = planEquipmentInventory(s.gear, this.store.items(), d.inventory, mode);
    return { plan, res: applyInventoryImport(d, plan.records, mode, this.store.nameOf) };
  });
  readonly shareText = signal('');
  readonly sharePreview = signal<ShareImportResult | null>(null);
  readonly cls = computed(() => (this.snap()?.profile.className ?? '').toLowerCase());
  private readonly kiskTables = computed(() => this.store.kiskCache().flatMap((s) => { const t = kiskToShareTable(s.report, s.fetchedAt); return t ? [t] : []; }));
  /** Priority per slot: user-imported tables > kisk.app ideal cards > shipped baseline. */
  private readonly eff = computed(() => {
    const base = this.store.shareBaseline()?.tables ?? [];
    const k = effectiveShareTable(this.cls(), this.kiskTables(), base);
    return effectiveShareTable(this.cls(), this.store.data().shareTables, k ? [k.table] : base);
  });
  readonly table = computed(() => this.eff()?.table);
  readonly shareCredit = computed(() => {
    const e = this.eff();
    const b = this.store.shareBaseline();
    if (!e || e.origin === 'user') return '';
    const n = b?.samples[this.cls()];
    return (b?.credit ?? '') + (n ? ' · n=' + n : '');
  });
  readonly tableOrigin = computed(() => this.eff()?.origin ?? null);
  private readonly observed = computed(() => observedMaxRolls(this.store.data().armoryCache.flatMap((s) => [...s.gear, ...s.arcana])));
  readonly views = computed(() => {
    const s = this.snap();
    const tb = this.table();
    return [...(s?.gear ?? []), ...(s?.arcana ?? [])].map((item) => {
      const slot = shareSlotOf(item.slotName);
      return { item, slot, ps: tb ? scorePiece(item, tb, this.observed()) : null, ideal: (slot && tb?.slots[slot]) || [] };
    });
  });
  readonly overall = computed(() => overallScore(this.views().map((v) => v.ps), this.table()?.bands));
  readonly anyStats = computed(() => this.views().some((v) => v.item.stats?.length));
  readonly groups = computed(() => {
    const v = this.views();
    return [
      { title: 'Scored slots', views: v.filter((x) => x.slot && x.slot !== 'arcana') },
      { title: 'Unscored', views: v.filter((x) => !x.slot) },
      { title: 'Arcana', views: v.filter((x) => x.slot === 'arcana') },
    ].filter((g) => g.views.length || (g.title === 'Arcana' && !!this.snap()));
  });
  applyInv(): void {
    const ip = this.invPreview();
    if (!ip) return;
    this.store.update(() => ip.res.data);
    this.invMode.set(null);
  }
  template() {
    return JSON.stringify(CLASSES.map((c) => EMPTY_TEMPLATE(c)).map(({ className }) => ({ className, bands: DEFAULT_BANDS, slots: Object.fromEntries(SHARE_SLOTS.map((s) => [s, []])) })), null, 2);
  }
  shareOf(v: { ps: PieceScore | null }, stat: string): number | null {
    return v.ps?.lines.find((l) => l.stat.toLowerCase() === stat.toLowerCase())?.share ?? null;
  }
  lineCount(t: ShareTable): number {
    return Object.values(t.slots).reduce((a, l) => a + (l?.length ?? 0), 0);
  }
  previewShare(): void {
    const t = this.shareText().trim();
    this.sharePreview.set(t.startsWith('[') || t.startsWith('{') ? parseShareJson(t) : parseShareCsv(t, parseCsv));
  }
  applyShare(mode: 'merge' | 'replace'): void {
    const p = this.sharePreview();
    if (!p?.tables.length) return;
    this.store.importShareTables(p.tables, mode);
    this.sharePreview.set(null);
    this.shareText.set('');
  }
  readonly craftableDummy = 0;
  links(c: SearchCandidate) {
    return armoryLinks(this.region(), c);
  }
  isUrl(s?: string) {
    return !!s && /^https:\/\//i.test(s);
  }
  statusLabel(s: string) {
    return s === 'match' ? 'Equipped' : s === 'mismatch' ? 'Different item' : s === 'unset' ? 'Not set' : 'Empty slot';
  }

  async lookup(): Promise<void> {
    const name = this.keyword().trim();
    this.lookupError.set('');
    this.candidates.set([]);
    this.loading.set(true);
    try {
      const res = await fetch(`/api/armory?region=${this.region()}&keyword=${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error(res.status === 429 ? 'Too many lookups, wait a minute.' : 'Armory lookup failed. Try again later.');
      const r = parseArmoryJson(await res.text());
      const list = r.candidates ?? [];
      const hit = pickCandidate(list, name, this.server());
      if (hit) await this.load(hit);
      else if (list.length) this.candidates.set(list);
      else this.lookupError.set('No character found. Check the region, server and name.');
    } catch (e) {
      this.lookupError.set(e instanceof Error && !(e instanceof TypeError) ? e.message : 'Armory lookup unavailable (the serverless function does not run under plain ng serve).');
    } finally {
      this.loading.set(false);
    }
  }
  async load(c: SearchCandidate): Promise<void> {
    this.loading.set(true);
    this.lookupError.set('');
    try {
      const res = await fetch(`/api/armory?region=${this.region()}&characterId=${encodeURIComponent(c.characterId)}&serverId=${c.serverId}`);
      if (!res.ok) throw new Error('Armory lookup failed. Try again later.');
      const r = parseArmoryJson(await res.text());
      if (r.error || !r.items) throw new Error(r.error ?? 'The armory returned no equipment.');
      const snap = buildSnapshot(r.profile, r.items);
      this.store.saveSnapshot(snap);
      this.store.selectOrCreateCharacter(snap.profile.name);
      this.selectedKey.set(snap.key);
      this.candidates.set([]);
    } catch (e) {
      this.lookupError.set(e instanceof Error && !(e instanceof TypeError) ? e.message : 'Armory lookup unavailable.');
    } finally {
      this.loading.set(false);
    }
  }
  createStarter(): void {
    const cls = this.currentClass();
    if (!cls) return;
    this.store.saveBisList(starterBisList(cls));
    this.className.set(cls);
  }
  setItem(e: BisEntry, name: string): void {
    const l = this.list();
    if (!l) return;
    this.store.saveBisList({ ...l, entries: l.entries.map((x) => (x.slot === e.slot ? { ...x, itemName: name.trim() } : x)), updatedAt: new Date().toISOString() });
  }

  canAdd(): boolean {
    return !!this.itemName().trim() && !!(this.className().trim() || this.snap()?.profile.className);
  }
  currentClass(): string {
    return (this.className().trim() || this.snap()?.profile.className || '').toLowerCase();
  }
  addEntry(): void {
    const cls = this.currentClass();
    const cur = this.store.data().bisLists.find((l) => l.className === cls);
    const id = Number(this.itemId());
    const entry: BisEntry = { slot: this.slot(), itemName: this.itemName().trim() };
    if (Number.isFinite(id) && id > 0) entry.armoryId = id;
    if (this.notes().trim()) entry.notes = this.notes().trim();
    const entries = [...(cur?.entries ?? []).filter((e) => e.slot.toLowerCase() !== entry.slot.toLowerCase()), entry];
    this.store.saveBisList({ className: cls, entries, updatedAt: new Date().toISOString() });
    this.className.set(cls);
    this.itemName.set('');
    this.itemId.set('');
    this.notes.set('');
  }
  removeEntry(e: BisEntry): void {
    const l = this.list();
    if (!l) return;
    const entries = l.entries.filter((x) => x.slot !== e.slot);
    if (entries.length) this.store.saveBisList({ ...l, entries, updatedAt: new Date().toISOString() });
    else this.store.removeBisList(l.className);
  }
  previewBis(): void {
    const t = this.bisText().trim();
    this.bisPreview.set(t.startsWith('[') || t.startsWith('{') ? parseBisJson(t) : parseBisCsv(t));
  }
  applyBis(mode: 'merge' | 'replace'): void {
    const p = this.bisPreview();
    if (!p?.lists.length) return;
    this.store.importBis(p.lists, mode);
    this.bisPreview.set(null);
    this.bisText.set('');
  }
  exportBis(): void {
    const blob = new Blob([JSON.stringify(this.store.data().bisLists, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'aion2-bis-lists.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  addToPlans(): void {
    const existing = new Set(this.store.characterPlans().map((p) => p.targetItemId));
    for (const id of this.craftable()) {
      if (existing.has(id)) continue;
      this.store.savePlan({ id: crypto.randomUUID(), name: `BiS: ${this.store.nameOf(id)}`, targetItemId: id, quantity: 1, server: this.store.settings().server, createdAt: new Date().toISOString() });
    }
  }
}
