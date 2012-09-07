/* 
This is a very lightweight and simple GFF3 parser that takes a GFF3 file such as this:

Group1.33	maker	gene	245454	247006	.	+	.	ID=maker-Group1%2E33-pred_gff_GNOMON-gene-4.137;Name=maker-Group1%252E33-pred_gff_GNOMON-gene-4.137;
Group1.33	maker	mRNA	245454	247006	.	+	.	ID=1:gnomon_566853_mRNA;Parent=maker-Group1%2E33-pred_gff_GNOMON-gene-4.137;Name=gnomon_566853_mRNA;_AED=0.45;_eAED=0.45;_QI=138|1|1|1|1|1|4|191|259;
Group1.33	maker	exon	245454	245533	.	+	.	ID=1:gnomon_566853_mRNA:exon:5976;Parent=1:gnomon_566853_mRNA;
Group1.33	maker	exon	245702	245879	.	+	.	ID=1:gnomon_566853_mRNA:exon:5977;Parent=1:gnomon_566853_mRNA;

and returns a JSON data structure like this:

[
  {"parent":
    [Group1.33","maker","gene","245454","247006",".","+",".","ID=maker-Group1%2E33-pred_gff_GNOMON-gene-4.137;Name=maker-Group1%252E33-pred_gff_GNOMON-gene-4.137"],
  "children": 
     [{"parent": [Group1.33","maker","mRNA","245454","247006",".","+",".","ID=1:gnomon_566853_mRNA;Parent=maker-Group1%2E33-pred_gff_GNOMON-gene-4.137;Name=gnomon_566853_mRNA;_AED=0.45;_eAED=0.45;_QI=138|1|1|1|1|1|4|191|259"],
      "children": [
             [Group1.33","maker","exon","245454","245533",".","+",".","ID=1:gnomon_566853_mRNA:exon:5976;Parent=1:gnomon_566853_mRNA"],
             [Group1.33","maker","exon","245702","245879",".","+",".","ID=1:gnomon_566853_mRNA:exon:5977;Parent=1:gnomon_566853_mRNA"]
          ]
     ]
   },
   ... next parent/child/descendants, e.g. gene/mRNA/exons or whatever ...
]

Created by Justin Reese 2012
justaddcoffee@gmail.com
*/

function GFF3toJson(gffFileURL) {
    return false;
}

