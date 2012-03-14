
var BamUtils = { };

/**
masks for BAM alignment bitwise FLAG field (bamrecord.flag)
0x1	template having multiple segments in sequencing 
0x2	each segment properly aligned according to the aligner 
0x4	segment unmapped
0x8	next segment in the template unmapped
0x10	SEQ being reverse complemented 
0x20	SEQ of the next segment in the template being reversed 
0x40	the first segment in the template 0x80	the last segment in the template
0x100	secondary alignment 
0x200	not passing quality controls 
0x400	PCR or optical duplicate
*/

BamUtils.START = 0;
BamUtils.END = 1;
BamUtils.STRAND = 2;
BamUtils.ID = 3;
BamUtils.CIGAR = 4;
BamUtils.SUBFEATURES = 5;
BamUtils.fields = {start: 0, 
		   end: 1, 
		   strand: 2, 
		   id: 3, 
		   cigar: 4, 
		   subfeatures: 5 
		  };
BamUtils.subFields = {start: 0, 
		      end: 1, 
		      strand: 2, 
		      type: 3};

BamUtils.lazyIndex = 2;
BamUtils.sublistIndex = 6;
//BamUtils.fields = { }
//for (var i=0; i<BamUtils.headers.length; i++)  {
//  BamUtils.fields[BamUtils.headers[i]] = i;
//}

BamUtils.subfeatureClasses =  {
    "M": "cigarM", 
    "D": "cigarD", 
    "N": "cigarN",   
    "=": "cigarEQ",   
    "E": "cigarEQ", 
    "X": "cigarX", 
    "I": "cigarI"
    // not making features for padding(P), soft clip(S), hard clip(H) CIGAR elements
};

/**
 *   Populates subfeatures array of given feature, based on feature's CIGAR string
 *       assumes feature has a CIGAR string
 *   WARNING: replaces any existing subfeatures array
 *   if for some reason there are existing (non-CIGAR based) subfeatures, 
 *       and want to prepend, append, or intermix CIGAR-based subfeats, will need to 
 *       use cigarToSubfeats for finer control 
 */
BamUtils.createSubfeats = function(feat)  {
    // console.log(feat);
    var subfeats = BamUtils.cigarToSubfeats(feat[BamUtils.CIGAR], feat[BamUtils.START], feat[BamUtils.STRAND]);
    feat[BamUtils.SUBFEATURES] = subfeats;
    return subfeats;
}
/**
 *  take a cigar string, and initial position, return an array of subfeatures
 */
BamUtils.cigarToSubfeats = function(cigar, offset, parent_strand)    {
    var subfeats = [];
    var lops = cigar.match(/\d+/g);   
    var ops = cigar.match(/\D/g);
    // console.log(cigar); console.log(ops); console.log(lops);
    var min = offset;
    var max;
    for (var i = 0; i < ops.length; i++)  {
	var lop = parseInt(lops[i]);  // operation length
	var op = ops[i];  // operation type
	// converting "=" to "E" to avoid possible problems later with non-alphanumeric type name
	if (op === "=")  { op = "E"; }  

	switch (op) {   
	   case 'M':
	   case 'D':
	   case 'N':
	   // case '=':
	   case 'E':
	   case 'X':
	      max = min + lop;
	      break;
	   case 'I':
	      max = min;
	      break;
	    case 'P':  // not showing padding deletions (possibly change this later -- could treat same as 'I' ?? )
	    case 'H':  // not showing hard clipping (since it's unaligned, and offset arg meant to be beginning of aligned part)
	    case 'S':  // not showing soft clipping (since it's unaligned, and offset arg meant to be beginning of aligned part)
	         break;
	    // other possible cases
	}
	var subfeat = [ min, max, parent_strand, op ];
	subfeats.push(subfeat);
	min = max;
    }
    return subfeats;
};

BamUtils.convertBamRecord = function (br, make_cigar_subfeats)  {
    var feat = [];
    // var fields = this.fields;
    // feat[fields.start] = br.pos;

    feat[BamUtils.START] = br.pos;
    // lref calc'd in dalliance/js/bam.js  BamFile.readBamRecords() function
    if (br.lref)  {  // determine length based on CIGAR (lref is calc'd based on CIGAR string)
	feat[BamUtils.END] = br.pos + br.lref;
    }
    else  {  // determin length based on read length (no CIGAR found to calc lref)
	feat[BamUtils.END] = br.pos + br.seq.length;
    }
    //feat[END] = br.pos + br.lref;
    // feat.segment = br.segment;
    // feat.type = 'bam';

    /*  can extract "SEQ reverse complement" from bitwise flag, 
     *    but that gives orientation of the _read sequence_ relative to the reference, 
     *    whereas feat[STRAND] is intended to indicate orientation of the _template_
     *        (in the case of RNA-Seq, the RNA that the read is derived from) relative to the reference
     *   for some BAM sources (such as TopHat), an optional field "XS" is used to to indicate RNA orientation 
     *        relative to ref.  'XS' values are '+' or '-' (any others?), 
     *        for some sources, lack of 'XS' is meant to indicate plus strand, only minus strand are specifically tagged
     *   for more on strandedness, see seqanswers.com/forums/showthread.php?t=9303
     *   TODO: really need to determine whether to look at bitwise flag, or XS, or something else based 
     *           on the origin of the BAM data (type of sequencer or program name, etc.)
     *           for now using XS based on honeybee BAM data
     */
    // trying to determine orientation from 'XS' optional field
    if (br.XS === '-') { feat[BamUtils.STRAND] = -1; }
    else  { feat[BamUtils.STRAND] = 1; }
    // var reverse = ((br.flag & 0x10) != 0);
    // feat[BamUtils.STRAND] = reverse ? -1 : 1;
    // feat[BamUtils.STRAND] = 1; // just calling starnd as forward for now

    // simple ID, just same as readName
    // feat[BamUtils.ID] = br.readName;

    // or possibly uniquify name by combining name, start, end (since read pairs etc. can have same readName):
    feat[BamUtils.ID] = br.readName + "/" + feat[BamUtils.START] + "-" + feat[BamUtils.END];

    // or to really guarantee uniqueness, combine name, start, end, cigar string
    //     since different alignments of same read could have identical start and end, but 
    //     differing alignment in between (and therefore different CIGAR string)
    // feat[BamUtils.ID] = br.readName + "/" + feat[BamUtils.START] + "-" + feat[BamUtils.END] + "/" + feat[BamUtils.CIGAR];

    // feat.notes = ['Sequence=' + br.seq, 'CIGAR=' + br.cigar, 'MQ=' + br.mq];
    // feat.seq = br.seq;  // not having seq field in feat for now
    feat[BamUtils.CIGAR] = br.cigar;   // cigar already translated from int array 
    if (make_cigar_subfeats)  {
	BamUtils.createSubfeats(feat);
    }
    return feat;
};

