/* 
   BamFeatureTrack ==> DraggableFeatureTrack ==> FeatureTrack ==> Track

   Differences in BamFeatureTrack
         suppression of histogram -- when zoomed out too far, instead show as grayed out?
         loading is different 
                there's no trackData.js, so override load() / loadSuccess() to bootstrap
                   so bootstrapping of NCList-ish struct, setting of sublistIndex, lazyFeatIndex etc
            rough equivalent of loading trackData.js might be loading .bam header, and .bai index file ?? 
 

   Unique Identity, BAM features, and NCLists:
      The NCLists used in BAM tracks do not strictly meet the full requirements 
      for nested containment lists.  In particular, the same BAM feature can be in 
      two (or more) different NCList containers (whereas in a strict nested containment 
      list each feature could only be in one container)

      Standard JBrowse features aren't guaranteed to have a unique id/name field, but  
          each feature is guaranteed to have a unique path through the NCLists to that feature.  
          Therefore unique IDs are generated for JBrowse features based on the features path 
          in the NCLists.
          But can't do this for BAM features because two different NCList paths could lead to 
          the same feature.  
          However BAM features _are_ guaranteed to have a unique id ???
          NEED TO ENSURE BAM FEATURES HAVE UNIQUE IDS ???  
               RNAME closest to an id, but read pairs can have same RNAME
                    so (RNAME + POS) ??   should be unique?
          Therefore instead of NCList path, BAM features use ??? for determining uniqueness
      Code for this is now pushed down into FeatureTrack.getId(), and unique id field is 
          indicated for a BAM track (or other tracks with unique ids for each feature) in 
          the trackData.json with the "uniqueIdField" setting
 */

function BamFeatureTrack(trackMeta, refSeq, browserParams) {
    DraggableFeatureTrack.call(this, trackMeta, refSeq, browserParams);
    this.glyphHeightPad = 0;
    this.levelHeightPad = 1;
}

BamFeatureTrack.prototype = new DraggableFeatureTrack();

/**
 *  "url" arg is present to preserve load signature, but 
 *  index and datafile URLs are actually pulled from trackMeta
 *  currently "url" arg passed is undefined
 */
/*
 BamFeatureTrack.prototype.load = function(url, trackMeta)  {
    console.log("called BamFeatureTrack.load()");  
    var bamurl = Util.resolveUrl(trackMeta.sourceUrl, trackMeta.data_url);
    var baiurl = Util.resolveUrl(trackMeta.sourceUrl, trackMeta.index_url);
    console.log("bam file " + bamurl);
    console.log("bai file " + baiurl);
    var bamfetch = new URLFetchable(bamurl);
    var baifetch = new URLFetchable(baiurl);
    console.log("built bam and bai URLFetchables");
    var curTrack = this;
    makeBam(bamfetch, baifetch, function(bamfile) {    // makeBam from dalliance/js/bam.js
		curTrack.loadSuccess(bamfile);
	    } );  
    // equivalent??: makeBam(bamfetch, baifetch, curTrack.loadSuccess);
    console.log("makeBam called");
}
*/


BamFeatureTrack.prototype.load = function()  {
    // 1.3.1 MERGE: for BamFeatureTrack, possibly others, will need to pass in entire config (was trackMeta), so 
    //     need to change signature of featurestore constructor
//    var storeclass = BamPseudoListStore;
//    this.featureStore = new SeqFeatureStore.BamPseudoListStore({
//    this.featureStore = new storeclass( {
    this.featureStore = new BamPseudoListStore( {
        urlTemplate: this.config.urlTemplate,
        baseUrl: this.config.baseUrl,
        refSeq: this.refSeq,
        config: this.config, 
        track: this
    });
    // connect the store and track loadSuccess and loadFailed events
    // to eachother
    dojo.connect( this.featureStore, 'loadSuccess', this, 'loadSuccess' );
    dojo.connect( this.featureStore, 'loadFail',    this, 'loadFail' );
    this.featureStore.load();
    return this.featureStore;
};


/**
 *  missing but still needed?
 *   config.scaleThresh.hist
 * 
 */
BamFeatureTrack.prototype.loadSuccess = function(bamfile)  { 
    console.log("BamFeatureTrack.loadSuccess called");
    this.bamfile = bamfile;   // bamfile is a BamFile from dalliance/js/bam.js, 
    // this.trackMeta is set in FeatureTrack.beforeLoad()
    // var trackInfo = this.trackMeta;

    // now set up rest of fields normally populated in loadSuccess via load of trackData.js
//    this.fields = BamUtils.fields;
//    this.subFields = BamUtils.subFields;  

    // possibly eventually do this by splitting feature based on skips in cigar string
    // this.subFields = BamUtils.subFields;
    // no url / basurl / importbaseurl needed, since BamFile already has url data for bam/bai access

    this.attrs = this.featureStore.attrs;

    this.initializeConfig();

    // don't ned histScale (not doing histograms yet)
    // need dummy labelScale, though no labels to show
    this.labelScale = 100; // in pixels/bp, so will never get scale > labelScale since max scale is CHAR_WIDTH pixels/bp
    // need dummy subfeatureScale, though no subfeats yet (but plan to have eventually based on CIGAR splitting)
    this.subfeatureScale = 0.01; // will attempt to show subfeatures if scale > subfeaturescale (if bp/pixel is < 100) (pixels/bp > 0.01) )
    
    // className etc. now in trackMeta(.config)
    // this.className = "bam";
    // this.subfeatureClasses = BamUtils.subfeatureClasses;  // NOT NEEDED until have subfeats based on CIGAR
    // this.arrowheadClass =  null;  // trying no arrowheads for now

    // this.renderClassName = ???  // not using render class different than className yet
    // this.urlTemplate = trackMeta.urlTemplate;  // NOT NEEDED
    // this.histogramMeta = trackMeta.histogramMeta;  // NOT NEEDED
    // ignoring histogram setup code, since not doing histograms yet
    //   same for histStats, histBinBases
    
    this.setLoaded();
    console.log("finished BamFeatureTrack.loadSuccess()");
}

BamFeatureTrack.prototype.fillBlock = function(blockIndex, block,
                                            leftBlock, rightBlock,
                                            leftBase, rightBase,
                                             scale, stripeWidth, 
					     containerStart, containerEnd) {
    // Histogram not implemented
    // 
    // Below a certain resolution ( x < pixels/bp, or y > bp/pixel  [x = 1/y])
    //   instead of histogram want to blank out blocks, 
    //   with some indicator that must zoom in to see BAM features
    // Preferably would calculate a good transition scale based on (sampling of) density of BAM data
    //    For now just picking resolution that works well with test data
    var bpPerPixel = 1/scale;  // scale = pixels/bp
    if (bpPerPixel >= 5) {
	// if (scale < ?)
	// do nothing -- grayed out?
	block.appendChild(document.createTextNode("Zoom in to view..."));
	block.style.backgroundColor = "#eee";
    }
    else  {
	this.fillFeatures(blockIndex, block, leftBlock, rightBlock,
			  leftBase, rightBase, scale, containerStart, containerEnd);
    }
};

/*
 BamFeatureTrack.prototype.calcLevelHeight = function(scale)  {
//    return this.glyphHeight;
    return this.glyphHeight;
};
*/

BamFeatureTrack.prototype.getId = function(feature, path)  {
    var id = feature.uid;
    if (!id)  { 
	// id = feature[BamUtils.ID] + "/" + feature[BamUtils.START] + "-" + feature[BamUtils.END];
//	id = this.features.getId(feature) + "/" + this.features.start(feature) + "-" + this.features.end(feature);
	id = feature.get('id') + "/" + feature.get('start') + "-" + feature.get('end');
	if (id) { feature.uid = id; }
    }
    return id;
}

/*
 BamFeatureTrack.prototype.getId = function(feature, path)  {
    var fid = this.fields["id"];
    return feature[fid];
};
*/

/*
Copyright (c) 2011 BerkeleyBOP
Created by Gregg Helt <gregghelt@gmail.com>

This package and its accompanying libraries are free software; you can
redistribute it and/or modify it under the terms of the LGPL (either
version 2.1, or at your option, any later version) or the Artistic
License 2.0.  Refer to LICENSE for the full license text.
*/
