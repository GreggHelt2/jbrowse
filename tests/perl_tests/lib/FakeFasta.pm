=head1 NAME

FakeFasta - supporting module for making random sequences, and files full of them

=head1 METHODS

=cut

package FakeFasta;

use strict;
use warnings;

use Carp;
use JSON 2 ();

=head2 random_seq( $length )

Return a random string of A,C,T,G,N of the given length.

=cut

sub random_seq {
    my ( $self, $length ) = @_;
    my $rand = '0' x $length;
    $rand =~ s/ . / [qw( A C T G N )]->[ int rand 5 ] /xge;
    return $rand;
}

=head2 fasta_to_fkfa( $file )

Given a FASTA file, examine it and generate a fkfa (fake FASTA)
description for it, which can be used by fkfa_to_fasta to regenerate
the file, almost the same but with random sequence.

Returns a hashref specification of the fkfa, as:

  [
    { id => 'FooSeq1', length => 1234, desc => 'blah blah' },
    ...
  ]

=cut

sub fasta_to_fkfa {
    my ( $self, $file ) = @_;

    my @spec;
    open my $f, '<', $file or die "$! reading $file";
    my $curr_entry;
    local $_; #< unlike for, while does not automatically localize $_
    while( <$f> ) {
        if( /^\s*>\s*(\S+)(.+)/ ) {
            push @spec, $curr_entry = { id => $1, desc => $2, length => 0 };
            chomp $curr_entry->{desc};
        }
        else {
            s/\s//g;
            if( $curr_entry ) {
                $curr_entry->{length} += length;
            }
            else { die 'parse error' }
        }
    }

    return \@spec;
}

=head2 fkfa_to_fasta( %args )

Given a .fkfa (fake FASTA) description, expand it to a full FASTA
file.  Returns a subroutine ref that, when called repeatedly, returns
chunks of the FASTA file output.

Example:

  fkfa_to_fasta( spec => \@fkfa_spec, out_file => '/path/to/output.fasta' );
  # OR
  fkfa_to_fasta( in_file => 'path/to/file.fkfa' );

=cut

sub fkfa_to_fasta {
    my ( $self, %args ) = @_;

    # slurp and decode the in_file if present
    if( $args{in_file} ) {
        open my $f, '<', $args{in_file} or die "$! reading '$args{in_file}'";
        local $/;
        $args{spec} = JSON::from_json( scalar <$f> );
    }

    croak "must provide a spec argument" unless $args{spec};
    croak "must provide an out_file argument" unless $args{out_file};

    # now open our output file and make our sequences
    open my $out_fh, '>', $args{out_file}
        or confess "$! writing '$args{out_file}'";

    for my $seq ( @{$args{spec}} ) {
        $out_fh->print(
            '>',
            $seq->{id},
            $seq->{desc} || '',
            "\n",
            $self->random_seq( $seq->{length} ),
            "\n"
          );
    }
}

1;
