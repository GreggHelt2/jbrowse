use strict;
use warnings;

use JBlibs;

use Test::More;
use Test::Warn;

use Bio::JBrowse::Cmd::FlatFileToJson;

use File::Spec::Functions qw( catfile catdir );
use File::Temp ();
use File::Copy::Recursive 'dircopy';

use lib 'tests/perl_tests/lib';
use FileSlurping 'slurp';

sub run_with(@) {
    #system $^X, 'bin/flatfile-to-json.pl', @_;
    #ok( ! $?, 'flatfile-to-json.pl ran ok' );
    my @args = @_;
    warnings_are {
      Bio::JBrowse::Cmd::FlatFileToJson->new( @args )->run;
    } [], 'ran without warnings';
}

sub tempdir {
    my $tempdir   = File::Temp->newdir( CLEANUP => $ENV{KEEP_ALL} ? 0 : 1 );
    #diag "using temp dir $tempdir";
    return $tempdir;
}

{  #diag "running on volvox";

    my $tempdir = tempdir();
    my $read_json = sub { slurp( $tempdir, @_ ) };
    dircopy( 'tests/data/volvox_formatted_refseqs', $tempdir );

    run_with (
        '--out' => $tempdir,
        '--bed' => 'sample_data/raw/volvox/volvox-remark.bed',
        '--trackLabel' => 'ExampleFeatures',
        '--key' => 'Example Features',
        '--autocomplete' => 'all',
        '--cssClass' => 'feature2',
        '--clientConfig' =>  '{"featureCss": "height: 8px;", "histScale": 2}',
        '--urltemplate' => 'http://example.com/{name}/{start}/{end}',
        );

    #system "find $tempdir -type f";
    #die 'break';

    run_with (
        '--out' => $tempdir,
        '--gff' => 'sample_data/raw/volvox/volvox.gff3',
        '--trackLabel' => 'CDS',
        '--key' => 'Predicted genes',
        '--type' => 'CDS:predicted,mRNA:exonerate,mRNA:predicted',
        '--autocomplete' => 'all',
        '--cssClass' => 'cds',
        '--compress',
        '--getPhase',
        '--getSubfeatures',
        );

    my $hist_output = $read_json->(qw( tracks ExampleFeatures ctgA hist-10000-0.json ));
    is_deeply( $hist_output, [4,3,4,3,4,1], 'got right histogram output for ExampleFeatures' ) or diag explain( $hist_output );

    my $names_output = $read_json->(qw( tracks ExampleFeatures ctgA names.json ));
    is_deeply( $names_output->[3],
               [
                 [
                   'f05'
                 ],
                 'ExampleFeatures',
                 'f05',
                 'ctgA',
                 4715,
                 5968,
                 undef
               ],
               'got the right names output'
               ) or diag explain $names_output;

    my $cds_trackdata = $read_json->(qw( tracks CDS ctgA trackData.jsonz ));
    is( $cds_trackdata->{featureCount}, 3, 'got right feature count for CDS track' ) or diag explain $cds_trackdata;
    is( scalar( @{$cds_trackdata->{histograms}{meta}}),
        scalar( @{$cds_trackdata->{histograms}{stats}}),
        'have stats for each precalculated hist' );

    is( ref $cds_trackdata->{intervals}{nclist}[2][10], 'ARRAY', 'exonerate mRNA has its subfeatures' )
       or diag explain $cds_trackdata;
    is( scalar @{$cds_trackdata->{intervals}{nclist}[2][10]}, 5, 'exonerate mRNA has 5 subfeatures' );

    my $tracklist = $read_json->('trackList.json');
    is_deeply( $tracklist->{tracks}[1]{style},
               { featureCss   => 'height: 8px;',
                 histScale    => 2,
                 className    => 'feature2',
                 linkTemplate => 'http://example.com/{name}/{start}/{end}'
               },
               '--clientConfig and --urltemplate options seem to work'
             ) or diag explain $tracklist;

    #system "find $tempdir";
}

{#   diag "running on single_au9_gene.gff3, testing --type filtering";

    my $tempdir = tempdir();
    dircopy( 'tests/data/AU9', $tempdir );

    run_with (
        '--out' => $tempdir,
        '--gff' => "tests/data/AU9/single_au9_gene.gff3",
        '--trackLabel' => 'AU_mRNA',
        '--key' => 'AU mRNA',
        '--type' => 'mRNA',
        '--autocomplete' => 'all',
        '--cssClass' => 'transcript',
        '--getPhase',
        '--getSubfeatures',
        );

    #system "find $tempdir";

    my $read_json = sub { slurp( $tempdir, @_ ) };
    my $cds_trackdata = $read_json->(qw( tracks AU_mRNA Group1.33 trackData.json ));
    is( $cds_trackdata->{featureCount}, 1, 'got right feature count' ) or diag explain $cds_trackdata;
    is( ref $cds_trackdata->{intervals}{nclist}[0][10], 'ARRAY', 'mRNA has its subfeatures' )
       or diag explain $cds_trackdata;
    is( scalar @{$cds_trackdata->{intervals}{nclist}[0][10]}, 7, 'mRNA has 7 subfeatures' );

    my $tracklist = $read_json->( 'trackList.json' );
    is( $tracklist->{tracks}[0]{key}, 'AU mRNA', 'got a tracklist' ) or diag explain $tracklist;
    is_deeply( $tracklist->{tracks}[0]{style}, { className => 'transcript' }, 'got the right style' ) or diag explain $tracklist;

    # run it again with a different CSS class, check that it updated
    run_with (
        '--out' => $tempdir,
        '--gff' => "tests/data/AU9/single_au9_gene.gff3",
        '--trackLabel' => 'AU_mRNA',
        '--key' => 'AU mRNA',
        '--type' => 'mRNA',
        '--autocomplete' => 'all',
        '--cssClass' => 'foo_fake_class',
        '--getPhase',
        '--getSubfeatures',
        );

    $tracklist = $read_json->( 'trackList.json' );
    is( $tracklist->{tracks}[0]{key}, 'AU mRNA', 'got a tracklist' );
    is_deeply( $tracklist->{tracks}[0]{style}, { className => 'foo_fake_class'}, 'got the right style' );

    # check that we got the same data as before
    $cds_trackdata = $read_json->(qw( tracks AU_mRNA Group1.33 trackData.json ));
    is( $cds_trackdata->{featureCount}, 1, 'got right feature count' ) or diag explain $cds_trackdata;
    is( ref $cds_trackdata->{intervals}{nclist}[0][10], 'ARRAY', 'mRNA has its subfeatures' )
       or diag explain $cds_trackdata;
    is( scalar @{$cds_trackdata->{intervals}{nclist}[0][10]}, 7, 'mRNA has 7 subfeatures' );
}

{   #diag "running on single_au9_gene.gff3, testing that we emit 2 levels of subfeatures";

    my $tempdir = tempdir();
    dircopy( 'tests/data/AU9', $tempdir );

    run_with (
        '--out' => $tempdir,
        '--gff' => "tests/data/AU9/single_au9_gene.gff3",
        '--trackLabel' => 'AU_mRNA',
        '--key' => 'AU mRNA',
        '--type' => 'gene',
        '--autocomplete' => 'all',
        '--cssClass' => 'transcript',
        '--getPhase',
        '--getSubfeatures',
        );

    #system "find $tempdir";

    my $read_json = sub { slurp( $tempdir, @_ ) };
    my $cds_trackdata = $read_json->(qw( tracks AU_mRNA Group1.33 trackData.json ));
    is( $cds_trackdata->{featureCount}, 1, 'got right feature count' ) or diag explain $cds_trackdata;
    is( ref $cds_trackdata->{intervals}{nclist}[0][10], 'ARRAY', 'gene has its subfeatures' )
       or diag explain $cds_trackdata;
    is( scalar @{$cds_trackdata->{intervals}{nclist}[0][10]}, 1, 'gene has 1 subfeature' );
    is( ref $cds_trackdata->{intervals}{nclist}[0][10][0][10], 'ARRAY', 'mRNA has its subfeatures' )
       or diag explain $cds_trackdata;
    is( scalar @{$cds_trackdata->{intervals}{nclist}[0][10][0][10]}, 7, 'mRNA has 7 subfeatures' );
}

for my $testfile ( "tests/data/au9_scaffold_subset.gff3", "tests/data/au9_scaffold_subset_sync.gff3" ) {
    # add a test for duplicate lazyclasses bug found by Gregg

    my $tempdir = tempdir();
    dircopy( 'tests/data/AU9', $tempdir );
    run_with (
        '--out' => $tempdir,
        '--gff' => $testfile,
        '--arrowheadClass' => 'transcript-arrowhead',
        '--getSubfeatures',
        '--subfeatureClasses' => '{"CDS": "transcript-CDS", "UTR": "transcript-UTR", "exon":"transcript-exon", "three_prime_UTR":"transcript-three_prime_UTR", "five_prime_UTR":"transcript-five_prime_UTR", "stop_codon":null, "start_codon":null}',
        '--cssClass' => 'transcript',
        '--type' => 'mRNA',
        '--trackLabel' => 'au9_full1',
        );

    my $read_json = sub { slurp( $tempdir, @_ ) };
    my $cds_trackdata = $read_json->(qw( tracks au9_full1 Group1.33 trackData.json ));
    is( $cds_trackdata->{featureCount}, 28, 'got right feature count' ) or diag explain $cds_trackdata;
}

{
    # test for warnings
    my $tempdir = tempdir();
    run_with (
        '--out' => $tempdir,
        '--gff' => catfile('tests','data','SL2.40ch10_sample.gff3'),
        '--compress',
        '--key' => 'Assembly',
        '--trackLabel' => 'assembly',
        );
    my $read_json = sub { slurp( $tempdir, @_ ) };
    my $trackdata = FileSlurping::slurp_tree( catdir( $tempdir, qw( tracks assembly SL2.40ch10 )));
    is( scalar( grep @{$trackdata->{$_}} == 0,
                grep /^lf/,
                keys %$trackdata
               ),
        0,
        'no empty chunks in trackdata'
      ) or diag explain $trackdata;
}

{   #diag "running on Group1.33_Amel_4.5.maker.gff with --webApollo flag, test for webapollo friendly nclist attribute, CDS features combined into wholeCDS features, and UTR features merged into an exon features";

    my $tempdir = tempdir();
    dircopy( 'tests/data/MAKER', $tempdir );

    run_with (
        '--out' => $tempdir,
	'--gff' => 'tests/data/MAKER/Group1.33_Amel_4.5.maker.gff',
	'--webApollo', # script is not liking this flag for some reason #&&&
	'--renderClassName' => 'ogsv3-transcript-render',
	'--arrowheadClass' => 'trellis-arrowhead',
	'--getSubs',
	'--subfeatureClasses' => '{"CDS": "ogsv3-CDS", "UTR": "ogsv3-UTR", "exon":"ogsv3-exon", "wholeCDS":null}',
	'--cssClass' => 'refseq-transcript',
	'--type' => 'mRNA',
	'--trackLabel' => 'just_maker_singleton',
        );

    my $read_json = sub { slurp( $tempdir, @_ ) };
    my $track_data = $read_json->(qw( tracks just_maker_singleton Group1.33 trackData.json ));
    my $track_list = $read_json->(qw( trackList.json ));

    # make sure we got rid of CDS features
    my @CDSfeat = grep {$_->[6] eq 'CDS' } @{$track_data->{'intervals'}->{'nclist'}->[0]->[10]};
    ok(scalar @CDSfeat == 0, '--webApollo flag gets rid of CDS features');

    # check wholeCDS
    my @wholeCDSfeat = grep {$_->[6] eq 'wholeCDS' } @{$track_data->{'intervals'}->{'nclist'}->[0]->[10]};
    ok(scalar @wholeCDSfeat == 1, '--webApollo flag causes wholeCDS feature to be created');
    is_deeply( $wholeCDSfeat[0],  [ 1, 245759, 246815, 1, 'maker', 0, "wholeCDS", undef, '1:gnomon_566853_mRNA:cds', undef, [] ],
               'got the right wholeCDS feature'
               ) or diag explain $wholeCDSfeat[0];

    my @utr_feats = grep {$_->[6] =~ '((five|three)_prime_)*UTR$' } @{$track_data->{'intervals'}->{'nclist'}->[0]->[10]};
    ok( scalar @utr_feats == 0, '--webApollo flag gets rid of UTR and five|three_prime_UTR features');

    # check for "renderClassName" : "ogsv3-transcript-render" keyval in mRNA feature
    ok($track_list->{'tracks'}->[3]->{'style'}->{'renderClassName'} eq 'ogsv3-transcript-render', '--renderClassName ogsv3-transcript-render flag puts "renderClassName" : "ogsv3-transcript-render" into mRNA feature');

    # check for "type" values are changed from "FeatureTrack" to "WebApollo/View/Track/DraggableHTMLFeatures" in mRNA feature
    ok($track_list->{'tracks'}->[3]->{'type'} eq 'WebApollo/View/Track/DraggableHTMLFeatures','--webApollo flag changes type values to DraggableFeatureTrack in mRNA feature');

}

{
    my $tempdir = tempdir();
    dircopy( 'tests/data/MAKER', $tempdir );

    run_with (
        '--out' => $tempdir,
	'--gff' => 'tests/data/MAKER/Group1.33_Amel_4.5.maker_WITH_INTRON.gff',
	'--arrowheadClass' => 'trellis-arrowhead',
	'--getSubs',
	'--subfeatureClasses' => '{"CDS": "ogsv3-CDS", "UTR": "ogsv3-UTR", "exon":"ogsv3-exon", "wholeCDS":null}',
	'--cssClass' => 'refseq-transcript',
	'--type' => 'mRNA',
	'--trackLabel' => 'just_maker_singleton',
	'--webApollo',
	'--renderClassName' => 'ogsv3-transcript-render'
        );

    my $read_json = sub { slurp( $tempdir, @_ ) };
    my $track_data = $read_json->(qw( tracks just_maker_singleton Group1.33 trackData.json ));
    my $track_list = $read_json->(qw( trackList.json ));

    # make sure we got rid of CDS features
    my @IntronFeat = grep {$_->[6] eq 'intron' } @{$track_data->{'intervals'}->{'nclist'}->[0]->[10]};
    ok(scalar @IntronFeat == 0, '--webApollo flag gets rid of intron features');
}

{   #diag "running on testWholeCDSCoords.gff with --webApollo flag, test for correct wholeCDS coordinates";

    my $tempdir = tempdir();
    dircopy( 'tests/data/MAKER', $tempdir );

    run_with (
        '--out' => $tempdir,
	'--gff' => 'tests/data/MAKER/testWholeCDSCoords.gff',
	'--arrowheadClass' => 'trellis-arrowhead',
	'--getSubs',
	'--subfeatureClasses' => '{"CDS": "ogsv3-CDS", "UTR": "ogsv3-UTR", "exon":"ogsv3-exon", "wholeCDS":null}',
	'--cssClass' => 'refseq-transcript',
	'--type' => 'mRNA',
	'--trackLabel' => 'just_maker_singleton',
	'--webApollo',
	'--renderClassName' => 'ogsv3-transcript-render'
        );

    my $read_json = sub { slurp( $tempdir, @_ ) };
    my $track_data = $read_json->(qw( tracks just_maker_singleton scf7180000670172 trackData.json ));
    my $track_list = $read_json->(qw( trackList.json ));

    # check wholeCDS
    my @wholeCDSfeat = grep {$_->[6] eq 'wholeCDS' } @{$track_data->{'intervals'}->{'nclist'}->[0]->[10]}; 

    ok( $wholeCDSfeat[0][1] == 395, 'wholeCDS has correct start coordinate');
    ok( $wholeCDSfeat[0][2] == 1444, 'wholeCDS has correct end coordinate');
    is_deeply( $wholeCDSfeat[0], [ 1, 395, 1444, '-1', 'maker', 0, 'wholeCDS', undef, 'maker-scf7180000670172-fgenesh-gene-0.6-mRNA-1:cds:3', undef, [] ],
               'got the right wholeCDS feature'
               ) or diag explain $wholeCDSfeat[0];

}


{
    my $snv_tempdir = tempdir();

    run_with (
        '--out' => $snv_tempdir,
        '--gff' => "tests/data/heterozygous_snv.gvf",
        '--trackLabel' => 'testSNV',
        '--key' => 'test SNV',
        '--type' => 'SNV',
        '--autocomplete' => 'all',
        '--cssClass' => 'transcript',
        );

    my $read_json = sub { slurp( $snv_tempdir, @_ ) };
    my $snv_trackdata = $read_json->(qw( tracks testSNV chr1 trackData.json ));

    is( $snv_trackdata->{featureCount}, 1, 'got right feature count' ) or diag explain $snv_trackdata;    
    is_deeply( $snv_trackdata->{'intervals'}->{'classes'}->[0]->{'attributes'}, 
	       ['Start', 'End',  'Strand', 'Source', 'Variant_reads2', 'Variant_seq', 'Seq_id', 'Variant_reads', 'Score', 'Genotype', 'Variant_seq2', 'Total_reads', 'Reference_seq', 'Type', 'Id'],  
	       'got right attributes in trackData.json for heterozygous SNV from GVF')  
	or diag explain $snv_trackdata->{'intervals'}->{'classes'}->[0]->{'attributes'};
    is_deeply( $snv_trackdata->{'intervals'}->{'nclist'}->[0],
	[0,  15882,   15883,  1,  'SOAPsnp',   16,  'G',  'chr1',  17,  36.5,  'heterozygous',  'C',  33,  'C',  'SNV',  'chr1:SOAP:SNV:15883'],
	"got right NClist for heterzygous SNV from GVF"
	) or diag explain $snv_trackdata->{'intervals'}->{'nclist'}->[0];
}

{
    my $snv_tempdir = tempdir();

    run_with (
        '--out' => $snv_tempdir,
        '--vcf' => "tests/data/heterozygous_snv.vcf",
        '--trackLabel' => 'testSNV',
        '--key' => 'test SNV',
        '--autocomplete' => 'all',
        );

    my $read_json = sub { slurp( $snv_tempdir, @_ ) };
    my $snv_trackdata = $read_json->(qw( tracks testSNV chr1 trackData.json ));
    is( $snv_trackdata->{intervals}->{nclist}->[0]->[1], 15882, 'start set correctly in json from VCF') or diag explain $snv_trackdata->{intervals}->{nclist}->[1];
    is( $snv_trackdata->{intervals}->{nclist}->[0]->[2], 15883, 'end set correctly in json from VCF') or diag explain $snv_trackdata->{intervals}->{nclist}->[2];
    is( $snv_trackdata->{intervals}->{minStart}, 15882, 'minStart set correctly in json from VCF') or diag explain $snv_trackdata->{intervals}->{minStart};
    is( $snv_trackdata->{intervals}->{maxEnd}, 15883, 'maxEnd set correctly in json from VCF') or diag explain $snv_trackdata->{intervals}->{maxEnd};
    is( $snv_trackdata->{intervals}->{nclist}->[0]->[10], "SNV", 'should set type as SNV in json from VCF') or diag explain $snv_trackdata->{nclist}->[0]->[10];
}


done_testing;
