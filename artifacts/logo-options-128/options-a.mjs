import {Raster, palette as p, backed} from './raster.mjs';

function ribbonP() {
  const body = new Raster('02 - Cobalt ribbon');
  body.polygon([[15,10],[41,10],[49,18],[49,31],[41,39],[26,39],[26,52],[15,52]], p.blue);
  body.cut(26,20,13,9);
  body.rect(15,10,23,3,p.blueLight);
  body.rect(15,13,3,36,p.blueLight);
  body.polygon([[39,20],[49,18],[49,31],[41,39],[26,39],[26,29],[39,29]],p.teal);
  body.rect(26,29,13,3,p.mint);
  body.rect(26,36,15,3,p.tealDark);
  const accent = new Raster('03 - Pixel registration');
  accent.rect(44,7,7,7,p.yellow).rect(44,7,7,2,p.yellowLight);
  return {number:1,slug:'ribbon-p',title:'RIBBON P',layers:[backed(body,2,p.blueDark),body,accent]};
}

function layerStack() {
  const body = new Raster('02 - Layer stack');
  body.polygon([[9,34],[31,23],[54,34],[54,39],[32,51],[9,39]],p.tealDark);
  body.polygon([[9,34],[31,23],[54,34],[32,46]],p.teal);
  body.polygon([[9,26],[31,15],[54,26],[54,31],[32,43],[9,31]],p.coralDark);
  body.polygon([[9,26],[31,15],[54,26],[32,38]],p.coral);
  body.polygon([[9,18],[31,7],[54,18],[54,23],[32,35],[9,23]],p.tealDark);
  body.polygon([[9,18],[31,7],[54,18],[32,30]],p.mint);
  const detail = new Raster('03 - Canvas tile');
  detail.polygon([[22,18],[31,13],[42,18],[32,24]],p.white);
  detail.polygon([[32,24],[42,18],[42,21],[32,27]],p.teal);
  detail.line(11,18,31,8,1,p.white);
  return {number:2,slug:'layer-stack',title:'LAYER STACK',layers:[backed(body,1),body,detail]};
}

function pixelNib() {
  const body = new Raster('02 - Split nib');
  body.polygon([[16,11],[45,11],[50,26],[32,51],[12,28]],p.tealDark);
  body.polygon([[16,11],[31,11],[31,47],[12,28]],p.mint);
  body.polygon([[31,11],[45,11],[50,26],[32,49]],p.teal);
  body.rect(18,8,25,6,p.ink);
  body.rect(19,8,23,2,p.blueLight);
  const detail = new Raster('03 - Ink channel and pixel');
  detail.rect(28,23,7,7,p.ink).rect(30,29,3,16,p.ink);
  detail.rect(16,16,2,9,p.white);
  detail.rect(29,51,6,6,p.coral).rect(29,51,6,2,p.coralLight);
  return {number:3,slug:'pixel-nib',title:'PIXEL NIB',layers:[backed(body,1),body,detail]};
}

function colorOrbit() {
  const body = new Raster('02 - Color orbit');
  const center=31;
  const hues=[p.coral,p.yellow,p.mint,p.teal,p.blue,p.blueLight,p.coralDark,p.coralLight];
  for(let y=8;y<55;y++) for(let x=8;x<55;x++) {
    const dx=x-center,dy=y-center;
    const distance=Math.max(Math.abs(dx),Math.abs(dy));
    if(distance>22 || Math.abs(dx)+Math.abs(dy)>32 || distance<10)continue;
    const angle=(Math.atan2(dy,dx)+Math.PI*2+Math.PI/8)%(Math.PI*2);
    body.dot(x,y,hues[Math.floor(angle/(Math.PI/4))]);
  }
  const detail = new Raster('03 - Center pixel');
  detail.rect(27,27,9,9,p.ink).rect(28,28,7,7,p.white);
  detail.rect(28,28,7,2,p.yellowLight);
  return {number:4,slug:'color-orbit',title:'COLOR ORBIT',layers:[backed(body,1),body,detail]};
}

function tileSpark() {
  const body = new Raster('02 - Pixel matrix');
  const tiles=[
    [12,12,p.blueLight],[25,12,p.blue],[38,12,p.teal],
    [12,25,p.blue],[25,25,p.teal],[38,25,p.mint],
    [12,38,p.teal],[25,38,p.mint],
  ];
  for(const [x,y,color] of tiles)body.rect(x,y,10,10,color);
  const detail = new Raster('03 - Spark tile');
  detail.polygon([[44,36],[47,41],[53,44],[47,47],[44,53],[41,47],[35,44],[41,41]],p.coral);
  detail.rect(42,42,4,4,p.yellowLight);
  for(const [x,y,color] of tiles) detail.rect(x,y,10,1,color===p.mint?p.white:p.blueLight);
  return {number:5,slug:'tile-spark',title:'TILE SPARK',layers:[backed(body,1),body,detail]};
}

export const optionsA = [ribbonP(),layerStack(),pixelNib(),colorOrbit(),tileSpark()];
