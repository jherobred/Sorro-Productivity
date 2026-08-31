/**
 * How each movement is actually performed.
 *
 * The catalogue in `lib/lift.ts` knows a lift's name, muscle and gear — enough
 * to log it, not enough to teach it. Someone standing at a rack who has not
 * done a face pull before needs the cues, and a demonstration with no words is
 * a picture of a person, not an instruction.
 *
 * Text and photographs both come from yuhonas/free-exercise-db, released under
 * the Unlicense (public domain), which is the same source `public/ex/` was
 * built from — so the two frames and the words describe the same movement, and
 * the whole lot redistributes inside an APK with no notice and no network.
 *
 * Generated, not written. Regenerate rather than editing by hand: the mapping
 * from our ids to the dataset's is listed at the bottom of this file.
 */

export type Form = {
  /** The dataset's own name, which is more precise than ours (grip, angle). */
  name: string;
  /** Numbered, in order. Between three and six for everything here. */
  steps: string[];
  primary: string[];
  secondary: string[];
  /** Empty for the cardio entries, which the dataset does not classify. */
  level: string;
  mechanic: string;
  force: string;
};

export const FORM: Record<string, Form> = {
  bench: {
    name: "Barbell Bench Press - Medium Grip",
    steps: [
      "Lie back on a flat bench. Using a medium width grip (a grip that creates a 90-degree angle in the middle of the movement between the forearms and the upper arms), lift the bar from the rack and hold it straight over you with your arms locked. This will be your starting position.",
      "From the starting position, breathe in and begin coming down slowly until the bar touches your middle chest.",
      "After a brief pause, push the bar back to the starting position as you breathe out. Focus on pushing the bar using your chest muscles. Lock your arms and squeeze your chest in the contracted position at the top of the motion, hold for a second and then start coming down slowly again. Tip: Ideally, lowering the weight should take about twice as long as raising it.",
      "Repeat the movement for the prescribed amount of repetitions.",
      "When you are done, place the bar back in the rack.",
    ],
    primary: ["chest"],
    secondary: ["shoulders", "triceps"],
    level: "beginner", mechanic: "compound", force: "push",
  },
  bike: {
    name: "Bicycling, Stationary",
    steps: [
      "To begin, seat yourself on the bike and adjust the seat to your height.",
      "Select the desired option from the menu. You may have to start pedaling to turn it on. You can use the manual setting, or you can select a program to use. Typically, you can enter your age and weight to estimate the amount of calories burned during exercise. The level of resistance can be changed throughout the workout. The handles can be used to monitor your heart rate to help you stay at an appropriate intensity.",
    ],
    primary: ["quadriceps"],
    secondary: ["calves", "glutes", "hamstrings"],
    level: "beginner", mechanic: "", force: "",
  },
  cablecrunch: {
    name: "Cable Crunch",
    steps: [
      "Kneel below a high pulley that contains a rope attachment.",
      "Grasp cable rope attachment and lower the rope until your hands are placed next to your face.",
      "Flex your hips slightly and allow the weight to hyperextend the lower back. This will be your starting position.",
      "With the hips stationary, flex the waist as you contract the abs so that the elbows travel towards the middle of the thighs. Exhale as you perform this portion of the movement and hold the contraction for a second.",
      "Slowly return to the starting position as you inhale. Tip: Make sure that you keep constant tension on the abs throughout the movement. Also, do not choose a weight so heavy that the lower back handles the brunt of the work.",
      "Repeat for the recommended amount of repetitions.",
    ],
    primary: ["abdominals"],
    secondary: [],
    level: "beginner", mechanic: "isolation", force: "pull",
  },
  cablefly: {
    name: "Cable Crossover",
    steps: [
      "To get yourself into the starting position, place the pulleys on a high position (above your head), select the resistance to be used and hold the pulleys in each hand.",
      "Step forward in front of an imaginary straight line between both pulleys while pulling your arms together in front of you. Your torso should have a small forward bend from the waist. This will be your starting position.",
      "With a slight bend on your elbows in order to prevent stress at the biceps tendon, extend your arms to the side (straight out at both sides) in a wide arc until you feel a stretch on your chest. Breathe in as you perform this portion of the movement. Tip: Keep in mind that throughout the movement, the arms and torso should remain stationary; the movement should only occur at the shoulder joint.",
      "Return your arms back to the starting position as you breathe out. Make sure to use the same arc of motion used to lower the weights.",
      "Hold for a second at the starting position and repeat the movement for the prescribed amount of repetitions.",
    ],
    primary: ["chest"],
    secondary: ["shoulders"],
    level: "beginner", mechanic: "isolation", force: "push",
  },
  calf: {
    name: "Standing Calf Raises",
    steps: [
      "Adjust the padded lever of the calf raise machine to fit your height.",
      "Place your shoulders under the pads provided and position your toes facing forward (or using any of the two other positions described at the beginning of the chapter). The balls of your feet should be secured on top of the calf block with the heels extending off it. Push the lever up by extending your hips and knees until your torso is standing erect. The knees should be kept with a slight bend; never locked. Toes should be facing forward, outwards or inwards as described at the beginning of the chapter. This will be your starting position.",
      "Raise your heels as you breathe out by extending your ankles as high as possible and flexing your calf. Ensure that the knee is kept stationary at all times. There should be no bending at any time. Hold the contracted position by a second before you start to go back down.",
      "Go back slowly to the starting position as you breathe in by lowering your heels as you bend the ankles until calves are stretched.",
      "Repeat for the recommended amount of repetitions.",
    ],
    primary: ["calves"],
    secondary: [],
    level: "beginner", mechanic: "isolation", force: "push",
  },
  crunch: {
    name: "Crunches",
    steps: [
      "Lie flat on your back with your feet flat on the ground, or resting on a bench with your knees bent at a 90 degree angle. If you are resting your feet on a bench, place them three to four inches apart and point your toes inward so they touch.",
      "Now place your hands lightly on either side of your head keeping your elbows in. Tip: Don't lock your fingers behind your head.",
      "While pushing the small of your back down in the floor to better isolate your abdominal muscles, begin to roll your shoulders off the floor.",
      "Continue to push down as hard as you can with your lower back as you contract your abdominals and exhale. Your shoulders should come up off the floor only about four inches, and your lower back should remain on the floor. At the top of the movement, contract your abdominals hard and keep the contraction for a second. Tip: Focus on slow, controlled movement - don't cheat yourself by using momentum.",
      "After the one second contraction, begin to come down slowly again to the starting position as you inhale.",
      "Repeat for the recommended amount of repetitions.",
    ],
    primary: ["abdominals"],
    secondary: [],
    level: "beginner", mechanic: "isolation", force: "pull",
  },
  curl: {
    name: "Barbell Curl",
    steps: [
      "Stand up with your torso upright while holding a barbell at a shoulder-width grip. The palm of your hands should be facing forward and the elbows should be close to the torso. This will be your starting position.",
      "While holding the upper arms stationary, curl the weights forward while contracting the biceps as you breathe out. Tip: Only the forearms should move.",
      "Continue the movement until your biceps are fully contracted and the bar is at shoulder level. Hold the contracted position for a second and squeeze the biceps hard.",
      "Slowly begin to bring the bar back to starting position as your breathe in.",
      "Repeat for the recommended amount of repetitions.",
    ],
    primary: ["biceps"],
    secondary: ["forearms"],
    level: "beginner", mechanic: "isolation", force: "pull",
  },
  dbfly: {
    name: "Dumbbell Flyes",
    steps: [
      "Lie down on a flat bench with a dumbbell on each hand resting on top of your thighs. The palms of your hand will be facing each other.",
      "Then using your thighs to help raise the dumbbells, lift the dumbbells one at a time so you can hold them in front of you at shoulder width with the palms of your hands facing each other. Raise the dumbbells up like you're pressing them, but stop and hold just before you lock out. This will be your starting position.",
      "With a slight bend on your elbows in order to prevent stress at the biceps tendon, lower your arms out at both sides in a wide arc until you feel a stretch on your chest. Breathe in as you perform this portion of the movement. Tip: Keep in mind that throughout the movement, the arms should remain stationary; the movement should only occur at the shoulder joint.",
      "Return your arms back to the starting position as you squeeze your chest muscles and breathe out. Tip: Make sure to use the same arc of motion used to lower the weights.",
      "Hold for a second at the contracted position and repeat the movement for the prescribed amount of repetitions.",
    ],
    primary: ["chest"],
    secondary: [],
    level: "beginner", mechanic: "isolation", force: "push",
  },
  dbrow: {
    name: "One-Arm Dumbbell Row",
    steps: [
      "Choose a flat bench and place a dumbbell on each side of it.",
      "Place the right leg on top of the end of the bench, bend your torso forward from the waist until your upper body is parallel to the floor, and place your right hand on the other end of the bench for support.",
      "Use the left hand to pick up the dumbbell on the floor and hold the weight while keeping your lower back straight. The palm of the hand should be facing your torso. This will be your starting position.",
      "Pull the resistance straight up to the side of your chest, keeping your upper arm close to your side and keeping the torso stationary. Breathe out as you perform this step. Tip: Concentrate on squeezing the back muscles once you reach the full contracted position. Also, make sure that the force is performed with the back muscles and not the arms. Finally, the upper torso should remain stationary and only the arms should move. The forearms should do no other work except for holding the dumbbell; therefore do not try to pull the dumbbell up using the forearms.",
      "Lower the resistance straight down to the starting position. Breathe in as you perform this step.",
      "Repeat the movement for the specified amount of repetitions.",
      "Switch sides and repeat again with the other arm.",
    ],
    primary: ["middle back"],
    secondary: ["biceps", "lats", "shoulders"],
    level: "beginner", mechanic: "compound", force: "pull",
  },
  deadlift: {
    name: "Barbell Deadlift",
    steps: [
      "Stand in front of a loaded barbell.",
      "While keeping the back as straight as possible, bend your knees, bend forward and grasp the bar using a medium (shoulder width) overhand grip. This will be the starting position of the exercise. Tip: If it is difficult to hold on to the bar with this grip, alternate your grip or use wrist straps.",
      "While holding the bar, start the lift by pushing with your legs while simultaneously getting your torso to the upright position as you breathe out. In the upright position, stick your chest out and contract the back by bringing the shoulder blades back. Think of how the soldiers in the military look when they are in standing in attention.",
      "Go back to the starting position by bending at the knees while simultaneously leaning the torso forward at the waist while keeping the back straight. When the weights on the bar touch the floor you are back at the starting position and ready to perform another repetition.",
      "Perform the amount of repetitions prescribed in the program.",
    ],
    primary: ["lower back"],
    secondary: ["calves", "forearms", "glutes", "hamstrings", "lats", "middle back", "quadriceps", "traps"],
    level: "intermediate", mechanic: "compound", force: "pull",
  },
  dip: {
    name: "Dips - Triceps Version",
    steps: [
      "To get into the starting position, hold your body at arm's length with your arms nearly locked above the bars.",
      "Now, inhale and slowly lower yourself downward. Your torso should remain upright and your elbows should stay close to your body. This helps to better focus on tricep involvement. Lower yourself until there is a 90 degree angle formed between the upper arm and forearm.",
      "Then, exhale and push your torso back up using your triceps to bring your body back to the starting position.",
      "Repeat the movement for the prescribed amount of repetitions.",
    ],
    primary: ["triceps"],
    secondary: ["chest", "shoulders"],
    level: "beginner", mechanic: "compound", force: "push",
  },
  facepull: {
    name: "Face Pull",
    steps: [
      "Facing a high pulley with a rope or dual handles attached, pull the weight directly towards your face, separating your hands as you do so. Keep your upper arms parallel to the ground.",
    ],
    primary: ["shoulders"],
    secondary: ["middle back"],
    level: "intermediate", mechanic: "compound", force: "pull",
  },
  frontsquat: {
    name: "Front Barbell Squat",
    steps: [
      "This exercise is best performed inside a squat rack for safety purposes. To begin, first set the bar on a rack that best matches your height. Once the correct height is chosen and the bar is loaded, bring your arms up under the bar while keeping the elbows high and the upper arm slightly above parallel to the floor. Rest the bar on top of the deltoids and cross your arms while grasping the bar for total control.",
      "Lift the bar off the rack by first pushing with your legs and at the same time straightening your torso.",
      "Step away from the rack and position your legs using a shoulder width medium stance with the toes slightly pointed out. Keep your head up at all times as looking down will get you off balance and also maintain a straight back. This will be your starting position. (Note: For the purposes of this discussion we will use the medium stance described above which targets overall development; however you can choose any of the three stances described in the foot positioning section).",
      "Begin to slowly lower the bar by bending the knees as you maintain a straight posture with the head up. Continue down until the angle between the upper leg and the calves becomes slightly less than 90-degrees (which is the point in which the upper legs are below parallel to the floor). Inhale as you perform this portion of the movement. Tip: If you performed the exercise correctly, the front of the knees should make an imaginary straight line with the toes that is perpendicular to the front. If your knees are past that imaginary line (if they are past your toes) then you are placing undue stress on the knee and the exercise has been performed incorrectly.",
      "Begin to raise the bar as you exhale by pushing the floor mainly with the middle of your foot as you straighten the legs again and go back to the starting position.",
      "Repeat for the recommended amount of repetitions.",
    ],
    primary: ["quadriceps"],
    secondary: ["calves", "glutes", "hamstrings"],
    level: "expert", mechanic: "compound", force: "push",
  },
  hammer: {
    name: "Hammer Curls",
    steps: [
      "Stand up with your torso upright and a dumbbell on each hand being held at arms length. The elbows should be close to the torso.",
      "The palms of the hands should be facing your torso. This will be your starting position.",
      "Now, while holding your upper arm stationary, exhale and curl the weight forward while contracting the biceps. Continue to raise the weight until the biceps are fully contracted and the dumbbell is at shoulder level. Hold the contracted position for a brief moment as you squeeze the biceps. Tip: Focus on keeping the elbow stationary and only moving your forearm.",
      "After the brief pause, inhale and slowly begin the lower the dumbbells back down to the starting position.",
      "Repeat for the recommended amount of repetitions.",
    ],
    primary: ["biceps"],
    secondary: [],
    level: "beginner", mechanic: "isolation", force: "pull",
  },
  hipthrust: {
    name: "Barbell Hip Thrust",
    steps: [
      "Begin seated on the ground with a bench directly behind you. Have a loaded barbell over your legs. Using a fat bar or having a pad on the bar can greatly reduce the discomfort caused by this exercise.",
      "Roll the bar so that it is directly above your hips, and lean back against the bench so that your shoulder blades are near the top of it.",
      "Begin the movement by driving through your feet, extending your hips vertically through the bar. Your weight should be supported by your shoulder blades and your feet. Extend as far as possible, then reverse the motion to return to the starting position.",
    ],
    primary: ["glutes"],
    secondary: ["calves", "hamstrings"],
    level: "intermediate", mechanic: "compound", force: "push",
  },
  incline: {
    name: "Barbell Incline Bench Press - Medium Grip",
    steps: [
      "Lie back on an incline bench. Using a medium-width grip (a grip that creates a 90-degree angle in the middle of the movement between the forearms and the upper arms), lift the bar from the rack and hold it straight over you with your arms locked. This will be your starting position.",
      "As you breathe in, come down slowly until you feel the bar on you upper chest.",
      "After a second pause, bring the bar back to the starting position as you breathe out and push the bar using your chest muscles. Lock your arms in the contracted position, squeeze your chest, hold for a second and then start coming down slowly again. Tip: it should take at least twice as long to go down than to come up.",
      "Repeat the movement for the prescribed amount of repetitions.",
      "When you are done, place the bar back in the rack.",
    ],
    primary: ["chest"],
    secondary: ["shoulders", "triceps"],
    level: "beginner", mechanic: "compound", force: "push",
  },
  inclinewalk: {
    name: "Walking, Treadmill",
    steps: [
      "To begin, step onto the treadmill and select the desired option from the menu. Most treadmills have a manual setting, or you can select a program to run. Typically, you can enter your age and weight to estimate the amount of calories burned during exercise. Elevation can be adjusted to change the intensity of the workout.",
      "Treadmills offer convenience, cardiovascular benefits, and usually have less impact than walking outside. When walking, you should move at a moderate to fast pace, not a leisurely one. Being an activity of lower intensity, walking doesn't burn as many calories as some other activities, but still provides great benefit. A 150 lb person will burn about 175 calories walking 4 miles per hour for 30 minutes, compared to 450 calories running twice as fast. Maintain proper posture as you walk, and only hold onto the handles when necessary, such as when dismounting or checking your heart rate.",
    ],
    primary: ["quadriceps"],
    secondary: ["calves", "glutes", "hamstrings"],
    level: "beginner", mechanic: "", force: "",
  },
  lateral: {
    name: "Seated Side Lateral Raise",
    steps: [
      "Pick a couple of dumbbells and sit at the end of a flat bench with your feet firmly on the floor. Hold the dumbbells with your palms facing in and your arms straight down at your sides at arms' length. This will be your starting position.",
      "While maintaining the torso stationary (no swinging), lift the dumbbells to your side with a slight bend on the elbow and the hands slightly tilted forward as if pouring water in a glass. Continue to go up until you arms are parallel to the floor. Exhale as you execute this movement and pause for a second at the top.",
      "Lower the dumbbells back down slowly to the starting position as you inhale.",
      "Repeat for the recommended amount of repetitions.",
    ],
    primary: ["shoulders"],
    secondary: [],
    level: "beginner", mechanic: "isolation", force: "push",
  },
  legcurl: {
    name: "Seated Leg Curl",
    steps: [
      "Adjust the machine lever to fit your height and sit on the machine with your back against the back support pad.",
      "Place the back of lower leg on top of padded lever (just a few inches under the calves) and secure the lap pad against your thighs, just above the knees. Then grasp the side handles on the machine as you point your toes straight (or you can also use any of the other two stances) and ensure that the legs are fully straight right in front of you. This will be your starting position.",
      "As you exhale, pull the machine lever as far as possible to the back of your thighs by flexing at the knees. Keep your torso stationary at all times. Hold the contracted position for a second.",
      "Slowly return to the starting position as you breathe in.",
      "Repeat for the recommended amount of repetitions.",
    ],
    primary: ["hamstrings"],
    secondary: [],
    level: "beginner", mechanic: "isolation", force: "pull",
  },
  legext: {
    name: "Leg Extensions",
    steps: [
      "For this exercise you will need to use a leg extension machine. First choose your weight and sit on the machine with your legs under the pad (feet pointed forward) and the hands holding the side bars. This will be your starting position. Tip: You will need to adjust the pad so that it falls on top of your lower leg (just above your feet). Also, make sure that your legs form a 90-degree angle between the lower and upper leg. If the angle is less than 90-degrees then that means the knee is over the toes which in turn creates undue stress at the knee joint. If the machine is designed that way, either look for another machine or just make sure that when you start executing the exercise you stop going down once you hit the 90-degree angle.",
      "Using your quadriceps, extend your legs to the maximum as you exhale. Ensure that the rest of the body remains stationary on the seat. Pause a second on the contracted position.",
      "Slowly lower the weight back to the original position as you inhale, ensuring that you do not go past the 90-degree angle limit.",
      "Repeat for the recommended amount of times.",
    ],
    primary: ["quadriceps"],
    secondary: [],
    level: "beginner", mechanic: "isolation", force: "push",
  },
  legpress: {
    name: "Leg Press",
    steps: [
      "Using a leg press machine, sit down on the machine and place your legs on the platform directly in front of you at a medium (shoulder width) foot stance. (Note: For the purposes of this discussion we will use the medium stance described above which targets overall development; however you can choose any of the three stances described in the foot positioning section).",
      "Lower the safety bars holding the weighted platform in place and press the platform all the way up until your legs are fully extended in front of you. Tip: Make sure that you do not lock your knees. Your torso and the legs should make a perfect 90-degree angle. This will be your starting position.",
      "As you inhale, slowly lower the platform until your upper and lower legs make a 90-degree angle.",
      "Pushing mainly with the heels of your feet and using the quadriceps go back to the starting position as you exhale.",
      "Repeat for the recommended amount of repetitions and ensure to lock the safety pins properly once you are done. You do not want that platform falling on you fully loaded.",
    ],
    primary: ["quadriceps"],
    secondary: ["calves", "glutes", "hamstrings"],
    level: "beginner", mechanic: "compound", force: "push",
  },
  legraise: {
    name: "Hanging Leg Raise",
    steps: [
      "Hang from a chin-up bar with both arms extended at arms length in top of you using either a wide grip or a medium grip. The legs should be straight down with the pelvis rolled slightly backwards. This will be your starting position.",
      "Raise your legs until the torso makes a 90-degree angle with the legs. Exhale as you perform this movement and hold the contraction for a second or so.",
      "Go back slowly to the starting position as you breathe in.",
      "Repeat for the recommended amount of repetitions.",
    ],
    primary: ["abdominals"],
    secondary: [],
    level: "expert", mechanic: "isolation", force: "pull",
  },
  lunge: {
    name: "Dumbbell Lunges",
    steps: [
      "Stand with your torso upright holding two dumbbells in your hands by your sides. This will be your starting position.",
      "Step forward with your right leg around 2 feet or so from the foot being left stationary behind and lower your upper body down, while keeping the torso upright and maintaining balance. Inhale as you go down. Note: As in the other exercises, do not allow your knee to go forward beyond your toes as you come down, as this will put undue stress on the knee joint. Make sure that you keep your front shin perpendicular to the ground.",
      "Using mainly the heel of your foot, push up and go back to the starting position as you exhale.",
      "Repeat the movement for the recommended amount of repetitions and then perform with the left leg.",
    ],
    primary: ["quadriceps"],
    secondary: ["calves", "glutes", "hamstrings"],
    level: "beginner", mechanic: "compound", force: "push",
  },
  ohp: {
    name: "Standing Military Press",
    steps: [
      "Start by placing a barbell that is about chest high on a squat rack. Once you have selected the weights, grab the barbell using a pronated (palms facing forward) grip. Make sure to grip the bar wider than shoulder width apart from each other.",
      "Slightly bend the knees and place the barbell on your collar bone. Lift the barbell up keeping it lying on your chest. Take a step back and position your feet shoulder width apart from each other.",
      "Once you pick up the barbell with the correct grip length, lift the bar up over your head by locking your arms. Hold at about shoulder level and slightly in front of your head. This is your starting position.",
      "Lower the bar down to the collarbone slowly as you inhale.",
      "Lift the bar back up to the starting position as you exhale.",
      "Repeat for the recommended amount of repetitions.",
    ],
    primary: ["shoulders"],
    secondary: ["triceps"],
    level: "beginner", mechanic: "compound", force: "push",
  },
  plank: {
    name: "Plank",
    steps: [
      "Get into a prone position on the floor, supporting your weight on your toes and your forearms. Your arms are bent and directly below the shoulder.",
      "Keep your body straight at all times, and hold this position as long as possible. To increase difficulty, an arm or leg can be raised.",
    ],
    primary: ["abdominals"],
    secondary: [],
    level: "beginner", mechanic: "isolation", force: "static",
  },
  preacher: {
    name: "Preacher Curl",
    steps: [
      "To perform this movement you will need a preacher bench and an E-Z bar. Grab the E-Z curl bar at the close inner handle (either have someone hand you the bar which is preferable or grab the bar from the front bar rest provided by most preacher benches). The palm of your hands should be facing forward and they should be slightly tilted inwards due to the shape of the bar.",
      "With the upper arms positioned against the preacher bench pad and the chest against it, hold the E-Z Curl Bar at shoulder length. This will be your starting position.",
      "As you breathe in, slowly lower the bar until your upper arm is extended and the biceps is fully stretched.",
      "As you exhale, use the biceps to curl the weight up until your biceps is fully contracted and the bar is at shoulder height. Squeeze the biceps hard and hold this position for a second.",
      "Repeat for the recommended amount of repetitions.",
    ],
    primary: ["biceps"],
    secondary: [],
    level: "beginner", mechanic: "isolation", force: "pull",
  },
  pulldown: {
    name: "Wide-Grip Lat Pulldown",
    steps: [
      "Sit down on a pull-down machine with a wide bar attached to the top pulley. Make sure that you adjust the knee pad of the machine to fit your height. These pads will prevent your body from being raised by the resistance attached to the bar.",
      "Grab the bar with the palms facing forward using the prescribed grip. Note on grips: For a wide grip, your hands need to be spaced out at a distance wider than shoulder width. For a medium grip, your hands need to be spaced out at a distance equal to your shoulder width and for a close grip at a distance smaller than your shoulder width.",
      "As you have both arms extended in front of you holding the bar at the chosen grip width, bring your torso back around 30 degrees or so while creating a curvature on your lower back and sticking your chest out. This is your starting position.",
      "As you breathe out, bring the bar down until it touches your upper chest by drawing the shoulders and the upper arms down and back. Tip: Concentrate on squeezing the back muscles once you reach the full contracted position. The upper torso should remain stationary and only the arms should move. The forearms should do no other work except for holding the bar; therefore do not try to pull down the bar using the forearms.",
      "After a second at the contracted position squeezing your shoulder blades together, slowly raise the bar back to the starting position when your arms are fully extended and the lats are fully stretched. Inhale during this portion of the movement.",
      "Repeat this motion for the prescribed amount of repetitions.",
    ],
    primary: ["lats"],
    secondary: ["biceps", "middle back", "shoulders"],
    level: "beginner", mechanic: "compound", force: "pull",
  },
  pullup: {
    name: "Pullups",
    steps: [
      "Grab the pull-up bar with the palms facing forward using the prescribed grip. Note on grips: For a wide grip, your hands need to be spaced out at a distance wider than your shoulder width. For a medium grip, your hands need to be spaced out at a distance equal to your shoulder width and for a close grip at a distance smaller than your shoulder width.",
      "As you have both arms extended in front of you holding the bar at the chosen grip width, bring your torso back around 30 degrees or so while creating a curvature on your lower back and sticking your chest out. This is your starting position.",
      "Pull your torso up until the bar touches your upper chest by drawing the shoulders and the upper arms down and back. Exhale as you perform this portion of the movement. Tip: Concentrate on squeezing the back muscles once you reach the full contracted position. The upper torso should remain stationary as it moves through space and only the arms should move. The forearms should do no other work other than hold the bar.",
      "After a second on the contracted position, start to inhale and slowly lower your torso back to the starting position when your arms are fully extended and the lats are fully stretched.",
      "Repeat this motion for the prescribed amount of repetitions.",
    ],
    primary: ["lats"],
    secondary: ["biceps", "middle back"],
    level: "beginner", mechanic: "compound", force: "pull",
  },
  pushdown: {
    name: "Triceps Pushdown",
    steps: [
      "Attach a straight or angled bar to a high pulley and grab with an overhand grip (palms facing down) at shoulder width.",
      "Standing upright with the torso straight and a very small inclination forward, bring the upper arms close to your body and perpendicular to the floor. The forearms should be pointing up towards the pulley as they hold the bar. This is your starting position.",
      "Using the triceps, bring the bar down until it touches the front of your thighs and the arms are fully extended perpendicular to the floor. The upper arms should always remain stationary next to your torso and only the forearms should move. Exhale as you perform this movement.",
      "After a second hold at the contracted position, bring the bar slowly up to the starting point. Breathe in as you perform this step.",
      "Repeat for the recommended amount of repetitions.",
    ],
    primary: ["triceps"],
    secondary: [],
    level: "beginner", mechanic: "isolation", force: "push",
  },
  pushup: {
    name: "Pushups",
    steps: [
      "Lie on the floor face down and place your hands about 36 inches apart while holding your torso up at arms length.",
      "Next, lower yourself downward until your chest almost touches the floor as you inhale.",
      "Now breathe out and press your upper body back up to the starting position while squeezing your chest.",
      "After a brief pause at the top contracted position, you can begin to lower yourself downward again for as many repetitions as needed.",
    ],
    primary: ["chest"],
    secondary: ["shoulders", "triceps"],
    level: "beginner", mechanic: "compound", force: "push",
  },
  rdl: {
    name: "Romanian Deadlift",
    steps: [
      "Put a barbell in front of you on the ground and grab it using a pronated (palms facing down) grip that a little wider than shoulder width. Tip: Depending on the weight used, you may need wrist wraps to perform the exercise and also a raised platform in order to allow for better range of motion.",
      "Bend the knees slightly and keep the shins vertical, hips back and back straight. This will be your starting position.",
      "Keeping your back and arms completely straight at all times, use your hips to lift the bar as you exhale. Tip: The movement should not be fast but steady and under control.",
      "Once you are standing completely straight up, lower the bar by pushing the hips back, only slightly bending the knees, unlike when squatting. Tip: Take a deep breath at the start of the movement and keep your chest up. Hold your breath as you lower and exhale as you complete the movement.",
      "Repeat for the recommended amount of repetitions.",
    ],
    primary: ["hamstrings"],
    secondary: ["calves", "glutes", "lower back"],
    level: "intermediate", mechanic: "compound", force: "pull",
  },
  row: {
    name: "Bent Over Barbell Row",
    steps: [
      "Holding a barbell with a pronated grip (palms facing down), bend your knees slightly and bring your torso forward, by bending at the waist, while keeping the back straight until it is almost parallel to the floor. Tip: Make sure that you keep the head up. The barbell should hang directly in front of you as your arms hang perpendicular to the floor and your torso. This is your starting position.",
      "Now, while keeping the torso stationary, breathe out and lift the barbell to you. Keep the elbows close to the body and only use the forearms to hold the weight. At the top contracted position, squeeze the back muscles and hold for a brief pause.",
      "Then inhale and slowly lower the barbell back to the starting position.",
      "Repeat for the recommended amount of repetitions.",
    ],
    primary: ["middle back"],
    secondary: ["biceps", "lats", "shoulders"],
    level: "beginner", mechanic: "compound", force: "pull",
  },
  rowerg: {
    name: "Rowing, Stationary",
    steps: [
      "To begin, seat yourself on the rower. Make sure that your heels are resting comfortably against the base of the foot pedals and that the straps are secured. Select the program that you wish to use, if applicable. Sit up straight and bend forward at the hips.",
      "There are three phases of movement when using a rower. The first phase is when you come forward on the rower. Your knees are bent and against your chest. Your upper body is leaning slightly forward while still maintaining good posture. Next, push against the foot pedals and extend your legs while bringing your hands to your upper abdominal area, squeezing your shoulders back as you do so. To avoid straining your back, use primarily your leg and hip muscles.",
      "The recovery phase simply involves straightening your arms, bending the knees, and bringing your body forward again as you transition back into the first phase.",
    ],
    primary: ["quadriceps"],
    secondary: ["biceps", "calves", "glutes", "hamstrings", "lower back", "middle back"],
    level: "intermediate", mechanic: "", force: "",
  },
  run: {
    name: "Running, Treadmill",
    steps: [
      "To begin, step onto the treadmill and select the desired option from the menu. Most treadmills have a manual setting, or you can select a program to run. Typically, you can enter your age and weight to estimate the amount of calories burned during exercise. Elevation can be adjusted to change the intensity of the workout.",
      "Treadmills offer convenience, cardiovascular benefits, and usually have less impact than running outside. A 150 lb person will burn over 450 calories running 8 miles per hour for 30 minutes. Maintain proper posture as you run, and only hold onto the handles when necessary, such as when dismounting or checking your heart rate.",
    ],
    primary: ["quadriceps"],
    secondary: ["calves", "glutes", "hamstrings"],
    level: "beginner", mechanic: "", force: "",
  },
  russian: {
    name: "Russian Twist",
    steps: [
      "Lie down on the floor placing your feet either under something that will not move or by having a partner hold them. Your legs should be bent at the knees.",
      "Elevate your upper body so that it creates an imaginary V-shape with your thighs. Your arms should be fully extended in front of you perpendicular to your torso and with the hands clasped. This is the starting position.",
      "Twist your torso to the right side until your arms are parallel with the floor while breathing out.",
      "Hold the contraction for a second and move back to the starting position while breathing out. Now move to the opposite side performing the same techniques you applied to the right side.",
      "Repeat for the recommended amount of repetitions.",
    ],
    primary: ["abdominals"],
    secondary: ["lower back"],
    level: "intermediate", mechanic: "compound", force: "pull",
  },
  shrug: {
    name: "Barbell Shrug",
    steps: [
      "Stand up straight with your feet at shoulder width as you hold a barbell with both hands in front of you using a pronated grip (palms facing the thighs). Tip: Your hands should be a little wider than shoulder width apart. You can use wrist wraps for this exercise for a better grip. This will be your starting position.",
      "Raise your shoulders up as far as you can go as you breathe out and hold the contraction for a second. Tip: Refrain from trying to lift the barbell by using your biceps.",
      "Slowly return to the starting position as you breathe in.",
      "Repeat for the recommended amount of repetitions.",
    ],
    primary: ["traps"],
    secondary: [],
    level: "beginner", mechanic: "isolation", force: "pull",
  },
  skip: {
    name: "Rope Jumping",
    steps: [
      "Hold an end of the rope in each hand. Position the rope behind you on the ground. Raise your arms up and turn the rope over your head bringing it down in front of you. When it reaches the ground, jump over it. Find a good turning pace that can be maintained. Different speeds and techniques can be used to introduce variation.",
      "Rope jumping is exciting, challenges your coordination, and requires a lot of energy. A 150 lb person will burn about 350 calories jumping rope for 30 minutes, compared to over 450 calories running.",
    ],
    primary: ["quadriceps"],
    secondary: ["calves", "hamstrings"],
    level: "intermediate", mechanic: "", force: "",
  },
  squat: {
    name: "Barbell Squat",
    steps: [
      "This exercise is best performed inside a squat rack for safety purposes. To begin, first set the bar on a rack to just below shoulder level. Once the correct height is chosen and the bar is loaded, step under the bar and place the back of your shoulders (slightly below the neck) across it.",
      "Hold on to the bar using both arms at each side and lift it off the rack by first pushing with your legs and at the same time straightening your torso.",
      "Step away from the rack and position your legs using a shoulder width medium stance with the toes slightly pointed out. Keep your head up at all times and also maintain a straight back. This will be your starting position. (Note: For the purposes of this discussion we will use the medium stance described above which targets overall development; however you can choose any of the three stances discussed in the foot stances section).",
      "Begin to slowly lower the bar by bending the knees and hips as you maintain a straight posture with the head up. Continue down until the angle between the upper leg and the calves becomes slightly less than 90-degrees. Inhale as you perform this portion of the movement. Tip: If you performed the exercise correctly, the front of the knees should make an imaginary straight line with the toes that is perpendicular to the front. If your knees are past that imaginary line (if they are past your toes) then you are placing undue stress on the knee and the exercise has been performed incorrectly.",
      "Begin to raise the bar as you exhale by pushing the floor with the heel of your foot as you straighten the legs again and go back to the starting position.",
      "Repeat for the recommended amount of repetitions.",
    ],
    primary: ["quadriceps"],
    secondary: ["calves", "glutes", "hamstrings", "lower back"],
    level: "beginner", mechanic: "compound", force: "push",
  },
  stairs: {
    name: "Stairmaster",
    steps: [
      "To begin, step onto the stairmaster and select the desired option from the menu. You can choose a manual setting, or you can select a program to run. Typically, you can enter your age and weight to estimate the amount of calories burned during exercise.",
      "Pump your legs up and down in an established rhythm, driving the pedals down but not all the way to the floor. It is recommended that you maintain your grip on the handles so that you don't fall. The handles can be used to monitor your heart rate to help you stay at an appropriate intensity.",
      "Stairmasters offer convenience, cardiovascular benefits, and usually have less impact than running outside. They are typically much harder than other cardio equipment. A 150 lb person will typically burn over 300 calories in 30 minutes, compared to about 175 calories walking.",
    ],
    primary: ["quadriceps"],
    secondary: ["calves", "glutes", "hamstrings"],
    level: "intermediate", mechanic: "", force: "",
  },
  triext: {
    name: "Standing Dumbbell Triceps Extension",
    steps: [
      "To begin, stand up with a dumbbell held by both hands. Your feet should be about shoulder width apart from each other. Slowly use both hands to grab the dumbbell and lift it over your head until both arms are fully extended.",
      "The resistance should be resting in the palms of your hands with your thumbs around it. The palm of the hands should be facing up towards the ceiling. This will be your starting position.",
      "Keeping your upper arms close to your head with elbows in and perpendicular to the floor, lower the resistance in a semicircular motion behind your head until your forearms touch your biceps. Tip: The upper arms should remain stationary and only the forearms should move. Breathe in as you perform this step.",
      "Go back to the starting position by using the triceps to raise the dumbbell. Breathe out as you perform this step.",
      "Repeat for the recommended amount of repetitions.",
    ],
    primary: ["triceps"],
    secondary: [],
    level: "beginner", mechanic: "isolation", force: "push",
  },
};

/** The form notes for a movement, or null for something typed in by hand. */
export const formOf = (id: string | null): Form | null => (id ? FORM[id] ?? null : null);

/* Our id -> free-exercise-db id, for regenerating this file:
 *   bench        Barbell_Bench_Press_-_Medium_Grip
 *   bike         Bicycling_Stationary
 *   cablecrunch  Cable_Crunch
 *   cablefly     Cable_Crossover
 *   calf         Standing_Calf_Raises
 *   crunch       Crunches
 *   curl         Barbell_Curl
 *   dbfly        Dumbbell_Flyes
 *   dbrow        One-Arm_Dumbbell_Row
 *   deadlift     Barbell_Deadlift
 *   dip          Dips_-_Triceps_Version
 *   facepull     Face_Pull
 *   frontsquat   Front_Barbell_Squat
 *   hammer       Hammer_Curls
 *   hipthrust    Barbell_Hip_Thrust
 *   incline      Barbell_Incline_Bench_Press_-_Medium_Grip
 *   inclinewalk  Walking_Treadmill
 *   lateral      Seated_Side_Lateral_Raise
 *   legcurl      Seated_Leg_Curl
 *   legext       Leg_Extensions
 *   legpress     Leg_Press
 *   legraise     Hanging_Leg_Raise
 *   lunge        Dumbbell_Lunges
 *   ohp          Standing_Military_Press
 *   plank        Plank
 *   preacher     Preacher_Curl
 *   pulldown     Wide-Grip_Lat_Pulldown
 *   pullup       Pullups
 *   pushdown     Triceps_Pushdown
 *   pushup       Pushups
 *   rdl          Romanian_Deadlift
 *   row          Bent_Over_Barbell_Row
 *   rowerg       Rowing_Stationary
 *   run          Running_Treadmill
 *   russian      Russian_Twist
 *   shrug        Barbell_Shrug
 *   skip         Rope_Jumping
 *   squat        Barbell_Squat
 *   stairs       Stairmaster
 *   triext       Standing_Dumbbell_Triceps_Extension
 */
