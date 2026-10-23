import { describe, expect, it } from 'vitest';
import { parseSearch, parseThing, parseXml } from '../src/online/bgg';

// Shape of xmlapi2 /thing?stats=1 (trimmed).
const THING = `<?xml version="1.0" encoding="utf-8"?>
<items termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
  <item type="boardgame" id="14996">
    <thumbnail>https://cf.geekdo-images.com/thumb.jpg</thumbnail>
    <name type="primary" sortindex="1" value="Ticket to Ride: Europe" />
    <name type="alternate" sortindex="1" value="Les Aventuriers du Rail: Europe" />
    <name type="alternate" sortindex="1" value="بلیط قطار: اروپا" />
    <yearpublished value="2005" />
    <minplayers value="2" />
    <maxplayers value="5" />
    <poll name="suggested_numplayers" title="User Suggested Number of Players" totalvotes="120">
      <results numplayers="2"><result value="Best" numvotes="10" /><result value="Recommended" numvotes="60" /><result value="Not Recommended" numvotes="20" /></results>
      <results numplayers="4"><result value="Best" numvotes="80" /><result value="Recommended" numvotes="30" /><result value="Not Recommended" numvotes="1" /></results>
      <results numplayers="5"><result value="Best" numvotes="40" /><result value="Recommended" numvotes="35" /><result value="Not Recommended" numvotes="5" /></results>
      <results numplayers="5+"><result value="Best" numvotes="0" /><result value="Recommended" numvotes="0" /><result value="Not Recommended" numvotes="50" /></results>
    </poll>
    <playingtime value="60" />
    <minplaytime value="30" />
    <maxplaytime value="60" />
    <link type="boardgamecategory" id="1034" value="Trains" />
    <link type="boardgamemechanic" id="2041" value="Card Game" />
    <link type="boardgamemechanic" id="2081" value="Network and Route Building" />
    <statistics page="1"><ratings>
      <usersrated value="40000" />
      <average value="7.5" />
      <ranks>
        <rank type="subtype" id="1" name="boardgame" friendlyname="Board Game Rank" value="150" bayesaverage="7.3" />
        <rank type="family" id="5499" name="familygames" friendlyname="Family Game Rank" value="20" bayesaverage="7.3" />
      </ranks>
      <numweights value="2000" />
      <averageweight value="1.9412" />
    </ratings></statistics>
  </item>
</items>`;

const SEARCH = `<?xml version="1.0" encoding="utf-8"?>
<items total="3" termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
  <item type="boardgame" id="230802"><name type="primary" value="Azul" /><yearpublished value="2017" /></item>
  <item type="boardgameexpansion" id="263423"><name type="primary" value="Azul: Joker Tiles" /><yearpublished value="2018" /></item>
  <item type="boardgame" id="javascript:x"><name type="primary" value="Bad" /></item>
</items>`;

describe('BoardGameGeek parsing', () => {
  it('reads specs, community best counts, weight and tags', () => {
    const g = parseThing(parseXml(THING))!;
    expect(g.id).toBe('14996');
    expect(g.name).toBe('Ticket to Ride: Europe');
    expect(g.altNames[0]).toBe('بلیط قطار: اروپا'); // Persian alternate first
    expect([g.minPlayers, g.maxPlayers]).toEqual([2, 5]);
    expect([g.playTimeMin, g.playTimeMax]).toEqual([30, 60]);
    expect(g.bestPlayers).toEqual([4, 5]); // "5+" ignored, 2 not "best"
    expect(g.weight).toBe(1.9);
    expect(g.tags).toEqual(expect.arrayContaining(['کارتی', 'خانوادگی']));
    expect(g.thumbnail).toBe('https://cf.geekdo-images.com/thumb.jpg');
  });

  it('skips weight without votes and polls with too few votes', () => {
    const doc = parseXml(THING.replace('<numweights value="2000" />', '<numweights value="0" />').replace('totalvotes="120"', 'totalvotes="2"'));
    const g = parseThing(doc)!;
    expect(g.weight).toBeUndefined();
    expect(g.bestPlayers).toEqual([]);
  });

  it('parses search hits and drops malformed ids', () => {
    const hits = parseSearch(parseXml(SEARCH));
    expect(hits.map((h) => h.id)).toEqual(['230802', '263423']);
    expect(hits[1].expansion).toBe(true);
    expect(hits[0].year).toBe(2017);
  });

  it('returns nothing for an empty result', () => {
    expect(parseThing(parseXml('<items termsofuse="x"></items>'))).toBeUndefined();
  });
});
