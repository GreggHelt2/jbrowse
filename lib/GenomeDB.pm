=head1 NAME

GenomeDB - central "handle" for a directory tree of JBrowse JSON data

=head1 SYNOPSIS

    my $gdb = GenomeDB->new( '/path/to/data/dir' );

    my $track = $gdb->getTrack($tableName);
    #returns an object for the track, e.g. a FeatureTrack

    unless( defined $track ) {
        $track = $gdb->createFeatureTrack( $trackLabel,
                                           $trackConfig,
                                           $track->{shortLabel} );
    }

=head1 DESCRIPTION

Central "handle" on a directory tree of JBrowse JSON data, containing
accessors for accessing the tracks and (soon) reference sequences it
contains.

=head1 METHODS

=cut

package GenomeDB;

use strict;
use warnings;
use File::Spec;

use JsonFileStorage;

my $defaultTracklist = {
                        formatVersion => 1,
                        tracks => []
                       };

my $trackListPath = "trackList.json";
my @trackDirHeirarchy = ("tracks", "{tracklabel}", "{refseq}");

=head2 new( '/path/to/data/dir' )

Create a new handle for a data dir.

=cut

sub new {
    my ($class, $dataDir) = @_;

    my $self = {
                dataDir => $dataDir,
                rootStore => JsonFileStorage->new($dataDir, 0, {pretty => 1}),
                trackDirTempl => File::Spec->join($dataDir, @trackDirHeirarchy),
                trackUrlTempl => join("/", @trackDirHeirarchy)
               };
    bless $self, $class;

    return $self;
}

=head2 writeTrackEntry( $track_object )

Record an entry for a new track in the data dir.

=cut

sub writeTrackEntry {
    my ($self, $track) = @_;

    my $setTrackEntry = sub {
        my ($trackData) = @_;
        unless (defined($trackData)) {
            $trackData = $defaultTracklist;
        }
        # we want to add this track entry to the "tracks" list,
        # replacing any existing entry with the same label,
        # and preserving the original ordering
        my $trackIndex;
        my $trackList = $trackData->{tracks};
        foreach my $index (0..$#{$trackList}) {
            $trackIndex = $index
              if ($trackList->[$index]->{label} eq $track->label);
        }
        $trackIndex = ($#{$trackList} + 1) unless defined($trackIndex);

        $trackList->[$trackIndex] = {
                                     label => $track->label,
                                     key => $track->key,
                                     type => $track->type,
                                     config => $track->config
                                    };
        return $trackData;
    };

    $self->{rootStore}->modify($trackListPath, $setTrackEntry);
}

=head2 createFeatureTrack( $label, \%config, $key )

Create a new FeatureTrack object in this data dir with the given
label, config, and key.

=cut

sub createFeatureTrack {
    my $self = shift;
    $self->_create_track( FeatureTrack => @_ );
}

=head2 createImageTrack( $label, \%config, $key )

Create a new ImageTrack object in this data dir with the given
label, config, and key.

=cut

sub createImageTrack {
    my $self = shift;
    $self->_create_track( ImageTrack => @_ );
}

sub _create_track {
    my ($self, $class, $trackLabel, $config, $key) = @_;
    eval "require $class"; die $@ if $@;
    (my $baseUrl = $self->{trackUrlTempl}) =~ s/\{tracklabel\}/$trackLabel/g;
    return $class->new( $self->trackDir($trackLabel), $baseUrl,
                        $trackLabel, $config, $key);
}

=head2 getTrack( $trackLabel )

Get a track object (FeatureTrack or otherwise) from the GenomeDB.

=cut

sub getTrack {
    my ($self, $trackLabel) = @_;

    my $trackList = $self->{rootStore}->get($trackListPath,
                                            $defaultTracklist);
    my ( $trackDesc ) = my @selected =
        grep { $_->{label} eq $trackLabel } @{$trackList->{tracks}};

    return undef unless @selected;

    # this should never happen
    die "multiple tracks labeled $trackLabel" if @selected > 1;

    ( my $type = $trackDesc->{type} ) =~ s/\W//g;

    eval "require $type"; die $@ if $@;

    (my $baseUrl = $self->{trackUrlTempl}) =~ s/\{tracklabel\}/$trackLabel/g;

    return $type->new( $self->trackDir($trackLabel),
                       $baseUrl,
                       $trackDesc->{label},
                       $trackDesc->{config},
                       $trackDesc->{key},
                     );
}

# private method
# Get the data subdirectory for a given track, using its label.
sub trackDir {
    my ($self, $trackLabel) = @_;
    (my $result = $self->{trackDirTempl}) =~ s/\{tracklabel\}/$trackLabel/g;
    return $result;
}

=head2 refSeqs

Returns a arrayref of hashrefs defining the reference sequences, as:

    [ {
        name         => 'ctgB',
        seqDir       => 'seq/ctgB',

        start        => 0
        end          => 66,
        length       => 66,

        seqChunkSize => 20000,
      },
      ...
    ]

=cut

sub refSeqs {
    shift->{rootStore}->get( 'seq/refSeqs.json', [] );
}


=head2 trackList

Return an arrayref of track definition hashrefs similar to:

    [
        {
          config => {
                      autocomplete => "all",
                      compress => 0,
                      feature => ["remark"],
                      key => "Example Features",
                      style => { className => "feature2" },
                      track => "ExampleFeatures",
                      urlTemplate => "tracks/ExampleFeatures/{refseq}/trackData.json",
                    },
          key    => "Example Features",
          label  => "ExampleFeatures",
          type   => "FeatureTrack",
        },
        ...
    ]

=cut

sub trackList {
    shift->{rootStore}->get( 'trackList.json', { tracks => [] } )->{tracks}
}


1;

=head1 AUTHOR

Mitchell Skinner E<lt>jbrowse@arctur.usE<gt>

Copyright (c) 2007-2011 The Evolutionary Software Foundation

This package and its accompanying libraries are free software; you can
redistribute it and/or modify it under the terms of the LGPL (either
version 2.1, or at your option, any later version) or the Artistic
License 2.0.  Refer to LICENSE for the full license text.

=cut
