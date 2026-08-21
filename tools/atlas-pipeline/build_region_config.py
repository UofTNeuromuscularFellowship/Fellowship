"""
Turn the per-region wish-lists into exact source object names.

Every candidate is checked against the source before it goes in the export, so
a name that does not exist is reported here rather than silently producing an
empty layer. Paired structures take the RIGHT side, matching the upper limb;
midline structures (tongue, diaphragm, sacrum) carry no suffix.
"""

import json

names = set(json.load(open('/home/claude/names.json'))['objects'])
mapping = json.load(open('/home/claude/remaining-map.json'))

BONES = {
    'lower-limb': ['Hip bone', 'Femur', 'Patella', 'Tibia', 'Fibula', 'Talus', 'Calcaneus',
                   'Navicular bone', 'Cuboid bone', 'Medial cuneiform bone',
                   'Intermediate cuneiform bone', 'Lateral cuneiform bone',
                   'First metatarsal bone', 'Second metatarsal bone', 'Third metatarsal bone',
                   'Fourth metatarsal bone', 'Fifth metatarsal bone']
    + [f'{p} phalanx of {f} finger of foot'
       for f in ['first', 'second', 'third', 'fourth', 'fifth']
       for p in ['Proximal', 'Middle', 'Distal']],
    'head-neck': ['Frontal bone', 'Parietal bone', 'Occipital bone', 'Temporal bone',
                  'Sphenoid bone', 'Maxilla', 'Mandible', 'Zygomatic bone', 'Nasal bone',
                  'Hyoid bone', 'Thyroid cartilage', 'Cricoid cartilage',
                  'Cervical vertebrae', 'Cervical vertebra'],
    'trunk': ['Sacrum', 'Coccyx', 'Hip bone', 'Manubrium of sternum', 'Body of sternum',
              'Xiphoid process', 'Thoracic vertebrae', 'Lumbar vertebrae']
    + [f'{n} rib' for n in ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh',
                            'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth']],
}

NERVES = {
    'lower-limb': ['Sciatic nerve', 'Tibial nerve', 'Common fibular nerve', 'Deep fibular nerve',
                   'Superficial fibular nerve', 'Femoral nerve', 'Obturator nerve',
                   'Anterior branch of obturator nerve', 'Posterior branch of obturator nerve',
                   'Saphenous nerve', 'Sural nerve', 'Medial sural cutaneous nerve',
                   'Lateral plantar nerve', 'Medial plantar nerve', 'Superior gluteal nerve',
                   'Lateral femoral cutaneous nerve', 'Posterior femoral cutaneous nerve',
                   'Infrapatellar branch of saphenous nerve'],
    'head-neck': ['Facial nerve (VII)', 'Trigeminal nerve (V)', 'Accessory nerve (XI)',
                  'Hypoglossal nerve (XII)', 'Vagus nerve (X)', 'Maxillary nerve',
                  'Ophthalmic nerve', 'Anterior division of mandibular nerve',
                  'Posterior division of mandibular nerve', 'Great auricular nerve',
                  'Lesser occipital nerve', 'Greater occipital nerve', 'Transverse cervical nerve'],
    'trunk': ['Intercostal nerves', 'Pudendal nerve', 'Iliohypogastric nerve',
              'Subcostal nerve', 'Genitofemoral nerve'],
}

VESSELS = {
    'lower-limb': ['Femoral artery', 'Deep femoral artery', 'Popliteal artery',
                   'Posterior tibial artery', 'Anterior tibial artery', 'Dorsalis pedis artery',
                   'Fibular artery', 'Great saphenous vein', 'Small saphenous vein',
                   'Femoral vein', 'Popliteal vein'],
    'head-neck': ['External carotid artery', 'Internal carotid artery',
                  'Right common carotid artery', 'Left common carotid artery',
                  'Facial artery', 'Superficial temporal artery', 'Internal jugular vein',
                  'External jugular vein'],
    'trunk': ['Thoracic aorta', 'Abdominal aorta', 'Inferior vena cava',
              'Internal pudendal artery', 'Superior epigastric artery',
              'Inferior epigastric artery'],
}


def resolve(base):
    """Right side for paired structures, bare name for midline ones."""
    if f'{base}.r' in names:
        return f'{base}.r'
    if base in names:
        return base
    return None


config, report = {}, {}
for region in ['lower-limb', 'head-neck', 'trunk']:
    muscles = sorted({o for row in mapping[region] for o in row['objects']
                      if o.endswith('.r') or '.' not in o})

    def pick(group):
        found, absent = [], []
        for b in group:
            r = resolve(b)
            (found if r else absent).append(r or b)
        return found, absent

    bones, no_bone = pick(BONES[region])
    nerves, no_nerve = pick(NERVES[region])
    vessels, no_vessel = pick(VESSELS[region])

    config[region] = {'muscles': muscles, 'bones': bones, 'nerves': nerves, 'vessels': vessels}
    report[region] = {'not_in_source': {'bones': no_bone, 'nerves': no_nerve,
                                        'vessels': no_vessel}}

    print(f'=== {region} ===')
    print(f'   muscles {len(muscles):3d}  bones {len(bones):3d}  '
          f'nerves {len(nerves):3d}  vessels {len(vessels):3d}')
    for k, v in report[region]['not_in_source'].items():
        if v:
            print(f'   not in source ({k}): {v}')

json.dump(config, open('/home/claude/region-objects.json', 'w'), indent=1)
