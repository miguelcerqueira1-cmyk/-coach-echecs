"""Écrit des fiches FR (site/data/repertoires/<rep>.js) + EN (en/<rep>.js) à partir de dictionnaires.
Usage : from gen import gen ; gen(rep, F, chemin_fr, chemin_en) ; champs : id, fam, nom, ligne, plan, st, pun?, minCp?, cases, ech, cons, vid."""
import sys,importlib.util
def gen(rep, F, frpath, enpath):
    def q(s): return "'"+s.replace("\\","\\\\").replace("'","\\'")+"'"
    fr='';en=''
    for f in F:
        pun=f.get('pun')
        fr+=f"""  {{
    id: '{f['id']}', rep: '{rep}', famille: {q(f['fam'][0])}, nom: {q(f['nom'][0])}, badge: 'theorie',
    ligne: '{f['ligne']}',
    plan: {q(f['plan'][0])},
    structure: {q(f['st'][0])},
    punition: {('{'+chr(10)+'      ligne: '+q(pun[0])+','+chr(10)+'      texte: '+q(pun[1])+','+chr(10)+(('      minCp: '+str(f['minCp'])+','+chr(10)) if f.get('minCp') else '')+'    }') if pun else 'null'},
    piege: null,
    cases: {q(f['cases'][0])},
    echanger: {q(f['ech'][0])},
    conserver: {q(f['cons'][0])},
    video: {{ recherche: {q(f['vid'])}, url: null }},
  }},
"""
        en+=f"""  '{f['id']}': {{
    famille: {q(f['fam'][1])},
    nom: {q(f['nom'][1])},
    plan: {q(f['plan'][1])},
    structure: {q(f['st'][1])},
    cases: {q(f['cases'][1])},
    echanger: {q(f['ech'][1])},
    conserver: {q(f['cons'][1])},
"""+(f"    punition: {q(pun[2])},\n" if pun else "")+"  },\n"
    for p,add,end in [(frpath,fr,'];'),(enpath,en,'};')]:
        s=open(p).read(); i=s.rstrip().rfind(end); assert i>0
        open(p,'w').write(s[:i]+add+end+'\n')
    print(len(F))
