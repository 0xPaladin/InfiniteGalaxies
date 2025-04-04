# Infinite Galaxies
Procedural generation of an entire galaxy. 

## Galaxies
When you first open the page you will be greeted with a randomly generated galaxy. 
All of your tools to edit the galaxy will always be in the GUI on the right. 

[Opening screen, a galaxy with crosshairs](docs/galaxy_crosshairs.png "galaxy with crosshairs")

Galaxies have the following inputs:
- Seed: The core seed for random generation. It effects the whole galaxy and everything else within. 
- Radius: The galaxy radius in 1000 ly increments. Between 40,000 and 60,000; the Milky way is ~50,000 ly. 
- Twist: How tight the spiral of the galaxy is. Between 30 and 150.  
- Culture Seed: You can set a different seed to generate the cultures of the galaxy. Currently cultures are not fully implemented, but you can see their claims. 
- Initial Cultures: Number of cultures to seed the galaxy with initial.
- Generations: Number of generations to iterate for cultural expansion.

**You have to press *update* to make any changes to the galaxy. You have to press *save* to save your changes so the galaxy is available after you reload the page.**

If you save your galaxy, when you come back you can select the galaxy seed from the dropdown on the right to load your saved work. 
If you modify any systems, they will be saved as well and you can go directly to them by selecting them from the dropdown as well. 

You can click anywhere on the galaxy to select individual sectors. You can see their ID in the "Sector Select" folder of the GUI. 
Alternately you can just input the sector ID in the GUI that you want to navigate to. 

## Sectors
The galaxy is sliced into 100 ly cubic region of space (100 ly x 100 ly x 100 ly) called **sectors**. A sector is identified by its location (x,y,z) within the galaxy. 
Every colored circle represents the star of a system within the sector.      

Sectors have the following inputs:
- Seed: A seed that will modify the generation of the systems within the sector.
- #of Systems: How many systems to generate within the sector. Between 32 and 256. The more systems, the longer the generation will take and the more crowded the display will be.  

[sector view](docs/sector.png "sector with system selected")

Click the save button to save changes you made to a particular sector. This automatically saves the galaxy as well. You will be able to select the sector from the main galaxy page on reload. 

You can click on any star to get information about the system. Information will display on the top left, and you can edit various attributes in the bottom right of the GUI.

System inputs:
- Name
- Position: The x, y, and z coordinates of the system within the sector. 
- Star Class: Change the primary star of the system. This will change how the planets are generated. 

## Systems
The individual star ssytems that make of the galaxy. Each will have its primary star and a number of planets with their own moons. 
When you first view a system, its information will be visible in the top left. Every system will have a number of Points of Interest (POI). 
These are more thematic, inspiration for gaming or writing, and have yet to be developed deeply.     

System inputs:
- Name
- Seed: This seed effects how the the system is generated. If changed, it will change the orbits, planet types and POI.  
- Star Class: Change the primary star of the system. This will change how the planets are generated.
- #of Planets: The number of planets. Between 0 and 24. Changing this will change orbits and planet types.  

[system view](docs/system_system.png "system view on first entry")

Click the save button to save changes you made to the system. This automatically saves the galaxy as well. You will be able to select the system from the main galaxy page on reload.

If you click on any planet or moon you can view their information (top left) and edit some of their attributes in the GUI.  

Planet/Moon inputs:
- Seed: This seed effects how planet is generated. If changed, it could change temperature, hydrology, atmosphere, and any features (to be implemented).
- Type: The type of planet. May be rocky, gas giant, or brown dwarf.  
- Orbital Radius: Change the orbit of the planet, measured in AU.
- Radius: The radius of the planet. This will change the gravity and habitability.
- Density: The density of the planet. This will change the gravity and habitability. 
- #of Moons: The number of moons. Changing this will change their orbits as well.  

[system with planet selected](docs/system_planet.png "system with planet selected")
