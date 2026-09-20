# Blender headless: animierte Spur für die X-Querung (Assistent -> Sprachen).
# Prinzipien statt Formeln: Vorlauf (Anticipation), Überschwingen (Overshoot),
# Nachpendeln (Settle), überlappende Teilbewegungen (Rotation läuft der
# Position nach). Export: 120 Frames [x, y, rotY, rotZ] als JSON.
# Aufruf: Blender -b -P make_cross.py
import bpy, json, math

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = 120

obj = bpy.data.objects.new('X', None)
bpy.context.collection.objects.link(obj)

# Einheiten: Design-px/100 fuer Position, Radiant fuer Rotation.
# Start = Keyframe bei 36.2vh (x+460, y-60, rotY 1.05), Ende = 40.2vh (x-460, rotY 2.10).
def key(frame, x, y, ry, rz):
    obj.location = (x/100.0, y/100.0, 0)
    obj.rotation_euler = (0, ry, rz)
    obj.keyframe_insert('location', frame=frame)
    obj.keyframe_insert('rotation_euler', frame=frame)

# Position: Vorlauf nach rechts, Querung, Überschwingen links, Nachpendeln
key(1,   460, -60, 1.05, 0.00)
key(16,  492, -52, 1.02, -0.02)   # Anticipation: kurz zurueck, leicht heben
key(70, -488, -84, 1.95, 0.05)    # Querung mit Ueberschwingen ueber das Ziel
key(88, -450, -56, 2.16, 0.02)    # Rueckpendeln (Rotation schwingt ueber)
key(101,-464, -62, 2.07, 0.005)   # zweites, kleineres Pendeln
key(120,-460, -60, 2.10, 0.00)    # Ruhe = Anschlusspose

frames = []
for f in range(1, 121):
    scene.frame_set(f)
    frames.append([round(obj.location.x*100, 2), round(obj.location.y*100, 2),
                   round(obj.rotation_euler.y, 5), round(obj.rotation_euler.z, 5)])

out = '/Users/levin/Dev/axyom-x/assets/x-cross.json'
json.dump({'note': 'x,y Design-px Versatz; rotY/rotZ rad; 120 Frames', 'frames': frames}, open(out, 'w'))
print('exportiert:', out, len(frames), 'frames')
print('start', frames[0], 'ende', frames[-1])
