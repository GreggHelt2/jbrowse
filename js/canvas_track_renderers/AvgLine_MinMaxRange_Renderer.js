
function AvgLine_MinMaxRange_Renderer()  {  }

AvgLine_MinMaxRange_Renderer.NAME = "AvgLine + MinMaxRange";
AvgLine_MinMaxRange_Renderer.ID = "AvgLine_MinMaxRange";

CanvasTrack.registerRenderer(AvgLine_MinMaxRange_Renderer);

AvgLine_MinMaxRange_Renderer.drawBlock = function (track, blockIndex, blockDiv,
					     leftBlock, rightBlock,
					     leftBase, rightBase,
					     scale, stripeWidth,
					     containerStart, containerEnd) {
    if (CanvasTrack.VERBOSE_RENDER) {  console.log("called AvgLine_MinMaxRange_Renderer.drawBlock");  }
    var mindex = track.getCoordIndex(leftBase);
    var maxdex = track.getCoordIndex(rightBase) + 1;
    if (maxdex >= track.locs.length)  { maxdex = track.locs.length-1; }
    var pixels_per_base = scale;
    var bases_per_pixel = 1.0/scale;
    var levels = track.wstack.sumLevels;
    var lcount = levels.length;
    var level = null;
    // need to switch to finding nearest level, rather than exact level???
    for (var lindex = 0; lindex<lcount; lindex++)  {
	var curlevel = levels[lindex];
	if (curlevel && (curlevel.pixelsPerBase == pixels_per_base)) {
	    level = curlevel;
	    break;
	}
    }
    var canvas = blockDiv.canvas;
    canvas.height = 100; 
    canvas.width = stripeWidth;
    var context = canvas.getContext("2d"); 
    context.clearRect(0,0,canvas.width,canvas.height);

    context.setTransform(1,0,0,1,0,0);
    var hscale = 100 / (track.maxviz-track.minviz);
    if (CanvasTrack.VERBOSE_RENDER)  { console.log("hscale: " + hscale); }
    context.scale(scale, hscale);
    context.translate(-leftBase, (track.maxviz-100));
    context.fillStyle = track.baseColor;

    if (pixels_per_base >= 1)  { // draw pixels_per_base wide
	if (CanvasTrack.VERBOSE_RENDER)  { console.log("drawing each point over multiple pixels"); }
	for (var index = mindex; index <= maxdex; index++)  {
	    var coord = track.locs[index];
	    var score = track.scores[index];
	    context.fillRect(coord, 100, 1, (score * -100));
	}
    }
    else  { 	// draw 1 pixel wide
	if (CanvasTrack.USE_LEVELS && level)  {  // current scale/zoom has a summary level, so render summary
	    mindex = track.getSumCoordIndex(leftBase, level);
//	    maxdex = track.getSumCoordIndex(rightBase, level) + 1;
	    maxdex = track.getSumCoordIndex(rightBase, level);
	    if (maxdex >= level.binMins.length)  { maxdex = level.binMins.length-1; }
	    var coords = level.binMins;
	    var mins = level.minScores;
	    var maxs = level.maxScores;
	    var avgs = level.avgScores;
	    var clength = coords.length;
	    var coord, min, max, avg;
	    console.log("mindex: " + mindex + ", coords length: " + coords.length);
	    console.log("score: " + coords[mindex]);

	    if (mindex < clength) {
		// context.fillStyle = track.baseColor;
		context.strokeStyle = track.baseColor;
		context.lineWidth = 3;
		// context.lineWidth = Math.round(bases_per_pixel);
		context.beginPath();
		context.moveTo(coords[mindex], 100);
		for (var index = mindex; index <= maxdex; index++) {
		    if (index >= clength || index < 0)  { console.log("exceeded plot data bounds"); }
		    coord = coords[index];
		    avg = avgs[index];
		    // if (min && max)  {
		    if (coord == undefined || avg == undefined)  {  // skip edge cases where avg is undefined...
			console.log("coord = " +  coord + ", avg = " + avg);
		    }
		    else  {
			// context.fillRect(coord, 100 - (avg * 100), 2 * bases_per_pixel, 2);
			//		    context.fillRect(coord, 100, bases_per_pixel, (avg * -100));
			context.lineTo(coord, 100 - (avg*100));
		    }
		}
		context.stroke();
		context.closePath();
	    }
//	    context.fillStyle = track.unsatLighterColor;
/*	    context.fillStyle = "#bbf";
	    for (var index = mindex; index <= maxdex; index++) {
		 if (index >= clength || index < 0)  { console.log("exceeded plot data bounds"); }
		 coord = coords[index];
		 min = mins[index];
		 if (coord == undefined || min == undefined)  {
		     console.log("coord = " +  coord + ", min = " + min + ", max = " + max);
		 }
		 else  {
		    // context.fillRect(coord, 100 - (min * 100), 1 * bases_per_pixel, 1);
		     //  context.fillRect(coord, 100 - (min * 100), bases_per_pixel+1, ((max-min) * -100));
		     context.fillRect(coord, 100, bases_per_pixel, (min * -100));
		 }
	    }
*/
	}
	else  {  // no summary level for current scale/zoom, so render actual scores
	    var coords = track.locs;
	    var scores = track.scores;
	    var clength = coords.length;
	    for (var index = mindex; index <= maxdex; index++)  {
		if (index >= clength || index < 0)  { console.log("exceeded plot data bounds"); }
		var coord = coords[index];
		var score = scores[index];
		// if (score)  {  // skip edge cases where score is undefined...
		context.fillRect(coord, 100, bases_per_pixel, (score * -100));
	    }
	}
    }

    //  context.fillStyle = "#000";
    //  context.fillRect(leftBase + (4 * bases_per_pixel), 0, -2 * bases_per_pixel, 100);
    //  context.fillRect(rightBase - (4 * bases_per_pixel), 0, 2 * bases_per_pixel, 100);
    track.heightUpdate(100, blockIndex);

};