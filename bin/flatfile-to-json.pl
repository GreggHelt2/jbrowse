#!/usr/bin/env perl

=head1 NAME

flatfile-to-json.pl - format data into JBrowse JSON format from an annotation file

=head1 USAGE

  flatfile-to-json.pl                                                         \
      ( --gff <GFF3 file> | --bed <BED file> )                                \
      --trackLabel <track identifier>                                         \
      [ --out <output directory> ]                                            \
      [ --key <human-readable track name> ]                                   \
      [ --cssClass <CSS class name for displaying features> ]                 \
      [ --autocomplete <none|label|alias|all> ]                               \
      [ --getType ]                                                           \
      [ --getPhase ]                                                          \
      [ --getSubfeatures ]                                                    \
      [ --getLabel ]                                                          \
      [ --urltemplate "http://example.com/idlookup?id={id}" ]                 \
      [ --arrowheadClass <CSS class> ]                                        \
      [ --subfeatureClasses '{ JSON-format subfeature class map }' ]          \
      [ --clientConfig '{ JSON-format extra configuration for this track }' ] \
      [ --thinType <BAM -thin_type> ]                                         \
      [ --thicktype <BAM -thick_type>]                                        \
      [ --type <feature types to process> ]                                   \
      [ --nclChunk <chunk size for generated NCLs> ]                          \
      [ --compress ]                                                          \
      [ --sortMem <memory in bytes to use for sorting> ]                      \

=head1 ARGUMENTS

=head2 REQUIRED

=over 4

=item --gff <GFF3 file>

=item --bed <BED file>

Process a GFF3 or BED-format file containing annotation data.

NOTE: This script does not support GFF version 2 or GTF (GFF 2.5) input.

=item --trackLabel <track identifier>

Unique identifier for this track.  Required.

=back

=head1 OPTIONAL

=over 4

=item --help | -h | -?

Display an extended help screen.

=item --key '<text>'

Human-readable track name.

=item --out <output directory>

Output directory to write to.  Defaults to "data/".

=item --cssClass <CSS class name for displaying features>

CSS class for features.  Defaults to "feature".

=item --autocomplete <none|label|alias|all>

Make these features searchable by their C<label>, by their C<alias>es,
both (C<all>), or C<none>.  Defaults to C<none>.

=item --getType

Include the type of the features in the JSON.

=item --getPhase

Include the phase of the features in the JSON.

=item --getSubfeatures

Include subfeatures in the JSON.

=item --getLabel

Include a label for the features in the JSON.

=item --urltemplate "http://example.com/idlookup?id={id}"

Template for a URL to be visited when features are clicked on.

=item --arrowheadClass <CSS class>

CSS class for arrowheads.

=item --subfeatureClasses '{ JSON-format subfeature class map }'

CSS classes for each subfeature type, in JSON syntax.  Example:

  --subfeatureClasses '{"CDS": "transcript-CDS", "exon": "transcript-exon"}'

=item --clientConfig '{ JSON-format extra configuration for this track }'

Extra configuration for the client, in JSON syntax.  Example:

  --clientConfig '{"featureCss": "background-color: #668; height: 8px;", "histScale": 2}'

=item --type <feature types to process>

Only process features of the given type.

=item --nclChunk <chunk size for generated NCLs>

NCList chunk size; if you get "json text or perl structure exceeds
maximum nesting level" errors, try setting this lower (default:
50,000).

=item --compress

Compress the output, making .jsonz (gzipped) JSON files.  This can
save a lot of disk space, but note that web servers require some
additional configuration to serve these correctly.

=item --sortMem <bytes>

Bytes of RAM to use for sorting features.  Default 512MB.

=back

=head2 BED-SPECIFIC

=over 4

=item --thinType <type>

=item --thickType <type>

Correspond to C<<-thin_type>> and C<<-thick_type>> in
L<Bio::FeatureIO::bed>.  Do C<<perldoc Bio::FeatureIO::bed>> for
details.

=back

=cut

use strict;
use warnings;

use FindBin qw($Bin);

use Getopt::Long;
use Pod::Usage;

use Bio::FeatureIO;

use lib "$Bin/../lib";
use ArrayRepr;
use GenomeDB;
use BioperlFlattener;
use ExternalSorter;
use JSON 2;

my ($gff, $bed, $bam, $trackLabel, $key,
    $urlTemplate, $subfeatureClasses, $arrowheadClass,
    $clientConfig, $thinType, $thickType,
    $types, $nclChunk);
$types = [];
my $autocomplete = "none";
my $outdir = "data";
my $cssClass = "feature";
my ($getType, $getPhase, $getSubs, $getLabel, $compress) = (0, 0, 0, 0, 0);
my $sortMem = 1024 * 1024 * 512;
my $help;
 GetOptions("gff=s" => \$gff,
           "bed=s" => \$bed,
           "bam=s" => \$bam,
	   "out=s" => \$outdir,
	   "tracklabel|trackLabel=s" => \$trackLabel,
	   "key=s" => \$key,
	   "cssClass=s" => \$cssClass,
	   "autocomplete=s" => \$autocomplete,
	   "getType" => \$getType,
	   "getPhase" => \$getPhase,
	   "getSubs|getSubfeatures" => \$getSubs,
	   "getLabel" => \$getLabel,
           "urltemplate=s" => \$urlTemplate,
           "arrowheadClass=s" => \$arrowheadClass,
           "subfeatureClasses=s" => \$subfeatureClasses,
           "clientConfig=s" => \$clientConfig,
           "thinType=s" => \$thinType,
           "thickType=s" => \$thickType,
           "type=s@" => \$types,
           "nclChunk=i" => \$nclChunk,
           "compress" => \$compress,
           "sortMem=i" =>\$sortMem,
           "help|h|?" => \$help,
  );
@$types = split /,/, join( ',', @$types);

pod2usage( -verbose => 2 ) if $help;

my $gdb = GenomeDB->new( $outdir );

my %refSeqs = map { $_->{name} => $_ } @{ $gdb->refSeqs };

scalar keys %refSeqs
    or die "run prepare-refseqs.pl first to supply information about your reference sequences";

pod2usage( "Must provide a --tracklabel parameter." ) unless defined $trackLabel;
pod2usage( "You must supply either a --gff or --bed parameter." )
  unless defined $gff || defined $bed || defined $bam;

$bam and die "BAM support has been moved to a separate program: bam-to-json.pl\n";

if (!defined($nclChunk)) {
    # default chunk size is 50KiB
    $nclChunk = 50000;
    # $nclChunk is the uncompressed size, so we can make it bigger if
    # we're compressing
    $nclChunk *= 4 if $compress;
}

my $idSub = sub {
    return $_[0]->load_id if $_[0]->can('load_id') && defined $_[0]->load_id;
    return $_[0]->can('primary_id') ? $_[0]->primary_id : $_[0]->id;
};

my $stream;
my $labelStyle = 1;
if ($gff) {
    my $io = Bio::FeatureIO->new(
        -format  => 'gff',
        -version => '3',
        -file    => $gff,
       );
    $stream = sub { $io->next_feature_group };
} elsif ($bed) {
    my $io = Bio::FeatureIO->new(
        -format => 'bed',
        -file   => $bed,
        ($thinType ? ("-thin_type" => $thinType) : ()),
        ($thickType ? ("-thick_type" => $thickType) : ()),
       );
    $labelStyle = sub {
        #label sub for features returned by Bio::FeatureIO::bed
        return $_[0]->name;
    };
    $stream = sub { $io->next_feature };
} else {
    die "Please specify --gff or --bed.\n";
}

$clientConfig = JSON::from_json( $clientConfig )
    if defined $clientConfig;

$subfeatureClasses = JSON::from_json($subfeatureClasses)
    if defined $subfeatureClasses;

my %config = (
    autocomplete => $autocomplete,
    type         => $getType || @$types ? 1 : 0,
    phase        => $getPhase,
    subfeatures  => $getSubs,
    style          => {
        %{ $clientConfig || {} },
        className      => $cssClass,
        ( $arrowheadClass    ? ( arrowheadClass    => $arrowheadClass       ) : () ),
        ( $subfeatureClasses ? ( subfeatureClasses => $subfeatureClasses ) : () ),
    },
    key          => defined($key) ? $key : $trackLabel,
    compress     => $compress,
    urlTemplate  => $urlTemplate,
 );


my $flattener = BioperlFlattener->new(
    $trackLabel,
    {
        "idSub"  => $idSub,
        "label"  => ($getLabel || ($autocomplete ne "none"))
                       ? $labelStyle : 0,
        %config,
    },
    [], [] );

# The ExternalSorter will get [chrom, [start, end, ...]] arrays from
# the flattener
my $sorter = ExternalSorter->new(
    do {
        my $startIndex = BioperlFlattener->startIndex;
        my $endIndex = BioperlFlattener->endIndex;
        sub ($$) {
            $_[0]->[0] cmp $_[1]->[0]
                ||
            $_[0]->[1]->[$startIndex] <=> $_[1]->[1]->[$startIndex]
                ||
            $_[1]->[1]->[$endIndex] <=> $_[0]->[1]->[$endIndex];
        }
    },
    $sortMem
);

my @arrayrepr_classes = (
    {
        attributes  => $flattener->featureHeaders,
        isArrayAttr => { Subfeatures => 1 },
    },
    {
        attributes  => $flattener->subfeatureHeaders,
        isArrayAttr => {},
    },
  );

# build a filtering subroutine for the features
my $filter = make_feature_filter( $types );

my %featureCounts;
while ( my @feats = $filter->( $stream->() ) ) {
    for my $feat ( @feats ) {
        my $chrom = ref $feat->seq_id ? $feat->seq_id->value : $feat->seq_id;
        $featureCounts{$chrom} += 1;

        my $row = [ $chrom,
                    $flattener->flatten_to_feature( $feat ),
                    $flattener->flatten_to_name( $feat, $chrom ),
                    ];
        $sorter->add( $row );
    }
}
$sorter->finish();

################################

my $track = $gdb->getTrack( $trackLabel )
            || $gdb->createFeatureTrack( $trackLabel,
                                         \%config,
                                         $config{key},
                                       );

my $curChrom = 'NONE YET';
my $totalMatches = 0;
my $totalChecked = 0;
while( my $feat = $sorter->get ) {
  $totalChecked++;
    next unless $refSeqs{ $feat->[0] }; # skip features we have no ref seq for

    unless( $curChrom eq $feat->[0] ) {
        $curChrom = $feat->[0];
        $track->finishLoad; #< does nothing if no load happening
        $track->startLoad( $curChrom,
                           $nclChunk,
                           \@arrayrepr_classes,
                         );
    }
    $totalMatches++;
    $track->addSorted( $feat->[1] );

    # load the feature's name record into the track if necessary
    if( my $namerec = $feat->[2] ) {
        $track->nameHandler->addName( $namerec );
    }
}
print("total checked: $totalChecked \n");

$gdb->writeTrackEntry( $track );

# If no features are found, check for mistakes in user input
if( !$totalMatches && defined $types ) {
    warn "WARNING: No matching features found for @$types\n";
}


################

sub make_feature_filter {

    my @filters;

    # add a filter for type:source if --type was specified
    if( $types && @$types ) {
        my @type_regexes = map {
            my $t = $_;
            $t .= ":.*" unless $t =~ /:/;
            qr/^$t$/
        } @$types;

        push @filters, sub {
            my ($f) = @_;
            my $type = $f->primary_tag
                or return 0;
            my $source = $f->source_tag;
            my $t_s = "$type:$source";
            for( @type_regexes ) {
                return 1 if $t_s =~ $_;
            }
            return 0;
        };
    }

    # if no filtering, just return a pass-through now.
    return sub { @_ } unless @filters;

    # make a sub that tells whether a single feature passes
    my $pass_feature = sub {
        my ($f) = @_;
        $_->($f) || return 0 for @filters;
        return 1;
    };

    # Apply this filtering rule through the whole feature hierarchy,
    # returning features that pass.  If a given feature passes, return
    # it *and* all of its subfeatures, with no further filtering
    # applied to the subfeatures.  If a given feature does NOT pass,
    # search its subfeatures to see if they do.
    return sub {
        _find_passing_features( $pass_feature, @_ );
    }
};

# given a subref that says whether an individual feature passes,
# return the LIST of features among the whole feature hierarchy that
# pass the filtering rule
sub _find_passing_features {
    my $pass_feature = shift;
    return map {
        my $feature = $_;
        $pass_feature->( $feature )
            # if this feature passes, we're done, just return it
            ? ( $feature )
            # otherwise, look for passing features in its subfeatures
            : _find_passing_features( $pass_feature, $feature->get_SeqFeatures );
    } @_;
}
